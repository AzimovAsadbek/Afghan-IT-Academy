import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

import type { SessionRevocationReason } from '../../../../generated/prisma/index.js';
import type { ClientContext } from '../../../common/index.js';
import { ENV, type Env } from '../../../config/index.js';
import {
  PrismaService,
  type PrismaTransactionClient,
} from '../../../infrastructure/prisma/index.js';
import { AuditService } from '../../audit/index.js';
import { TokenService } from '../crypto/index.js';
import { AUTH_ACTIONS } from '../auth-actions.js';
import { SessionStore, type ActiveSession } from './session-store.js';

/** The credentials handed back to the caller after a login or a refresh. */
export interface IssuedSession {
  readonly sessionId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessTokenExpiresAt: Date;
  readonly refreshTokenExpiresAt: Date;
}

/** A session as shown to its owner in the security settings page. */
export interface SessionSummary {
  readonly id: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly ipPrefix: string | null;
  readonly userAgent: string | null;
  readonly isCurrent: boolean;
}

/** Why a refresh attempt failed. The caller maps these to a response. */
export type RefreshFailure = 'unknown' | 'expired' | 'revoked' | 'reused';

export type RefreshResult =
  | { readonly ok: true; readonly session: IssuedSession; readonly userId: string }
  | { readonly ok: false; readonly reason: RefreshFailure };

/**
 * Session lifecycle: creation, rotation, revocation and listing.
 *
 * Sessions live in two places on purpose. Postgres holds the durable record —
 * what devices are signed in, when, and the refresh-token chain — because a
 * user must be able to list and revoke their devices and because a Redis flush
 * must not erase the security history. Redis holds only the fast path: is this
 * access token still good?
 */
@Injectable()
export class SessionService {
  private readonly accessTtlMs: number;
  private readonly refreshTtlMs: number;
  private readonly sessionTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: SessionStore,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly logger: Logger,
    @Inject(ENV) env: Env,
  ) {
    this.accessTtlMs = env.AUTH_ACCESS_TOKEN_TTL_SECONDS * 1000;
    this.refreshTtlMs = env.AUTH_REFRESH_TOKEN_TTL_SECONDS * 1000;
    this.sessionTtlMs = env.AUTH_SESSION_ABSOLUTE_TTL_SECONDS * 1000;
  }

  /**
   * Starts a new session for a user who has just proved their identity.
   *
   * Accepts a transaction so login can persist the session, reset the failed
   * login counter and write its audit row atomically.
   */
  async create(
    userId: string,
    context: ClientContext,
    tx?: PrismaTransactionClient,
  ): Promise<IssuedSession> {
    const client = tx ?? this.prisma;
    const now = Date.now();
    const sessionExpiresAt = new Date(now + this.sessionTtlMs);

    const session = await client.session.create({
      data: {
        userId,
        expiresAt: sessionExpiresAt,
        ipPrefix: context.ipPrefix,
        userAgent: context.userAgent,
      },
      select: { id: true },
    });

    const refreshToken = this.tokens.generate();
    const refreshExpiresAt = new Date(now + this.refreshTtlMs);

    await client.refreshToken.create({
      data: {
        sessionId: session.id,
        // A new login starts a new family. Reuse detection is scoped to the
        // chain descending from this token, not to everything the user owns.
        familyId: crypto.randomUUID(),
        tokenHash: this.tokens.hash(refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });

    const accessToken = await this.activate(session.id, userId, sessionExpiresAt);

    return {
      sessionId: session.id,
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(now + this.accessTtlMs),
      refreshTokenExpiresAt: refreshExpiresAt,
    };
  }

  /** Resolves an access token for the request guard. */
  async resolveAccessToken(rawToken: string): Promise<ActiveSession | null> {
    return this.store.resolve(rawToken);
  }

  /**
   * Exchanges a refresh token for a new pair, rotating it.
   *
   * ## Reuse detection
   *
   * A refresh token is single-use. Presenting one that has already been
   * exchanged means two parties hold it — and we cannot tell which is the
   * legitimate client. The whole family is therefore revoked, ending the
   * session, on the principle that forcing a genuine user to sign in again is a
   * far smaller harm than leaving a stolen chain alive.
   *
   * ## Concurrency
   *
   * The token is claimed with a conditional UPDATE rather than a read followed
   * by a write. Two simultaneous refreshes with the same token would otherwise
   * both observe `usedAt IS NULL` and both mint a new pair; here exactly one
   * update matches and the loser is treated as a replay.
   */
  async refresh(rawRefreshToken: string, context: ClientContext): Promise<RefreshResult> {
    const tokenHash = this.tokens.hash(rawRefreshToken);

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        sessionId: true,
        familyId: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        session: { select: { id: true, userId: true, expiresAt: true, revokedAt: true } },
      },
    });

    if (!existing) return { ok: false, reason: 'unknown' };

    if (existing.usedAt !== null) {
      await this.handleReuse(
        existing.familyId,
        existing.session.id,
        existing.session.userId,
        context,
      );
      return { ok: false, reason: 'reused' };
    }

    if (existing.revokedAt !== null || existing.session.revokedAt !== null) {
      return { ok: false, reason: 'revoked' };
    }

    const now = Date.now();
    if (existing.expiresAt.getTime() <= now || existing.session.expiresAt.getTime() <= now) {
      return { ok: false, reason: 'expired' };
    }

    const rotated = this.tokens.generate();
    const rotatedExpiresAt = new Date(
      // Never past the session's absolute ceiling.
      Math.min(now + this.refreshTtlMs, existing.session.expiresAt.getTime()),
    );

    const claimed = await this.prisma.$transaction(async (tx) => {
      // Atomic claim. Zero rows means another request already spent this token.
      const claim = await tx.refreshToken.updateMany({
        where: { id: existing.id, usedAt: null, revokedAt: null },
        data: { usedAt: new Date() },
      });

      if (claim.count === 0) return false;

      await tx.refreshToken.create({
        data: {
          sessionId: existing.sessionId,
          familyId: existing.familyId,
          tokenHash: this.tokens.hash(rotated),
          expiresAt: rotatedExpiresAt,
        },
      });

      await tx.session.update({
        where: { id: existing.sessionId },
        data: { lastSeenAt: new Date() },
      });

      return true;
    });

    if (!claimed) {
      // Lost the race. Treated as a replay: the same reasoning applies, we
      // cannot distinguish a double-submitting client from an attacker.
      await this.handleReuse(
        existing.familyId,
        existing.session.id,
        existing.session.userId,
        context,
      );
      return { ok: false, reason: 'reused' };
    }

    const accessToken = await this.activate(
      existing.session.id,
      existing.session.userId,
      existing.session.expiresAt,
    );

    return {
      ok: true,
      userId: existing.session.userId,
      session: {
        sessionId: existing.session.id,
        accessToken,
        refreshToken: rotated,
        accessTokenExpiresAt: new Date(now + this.accessTtlMs),
        refreshTokenExpiresAt: rotatedExpiresAt,
      },
    };
  }

  /** Ends one session. */
  async revoke(sessionId: string, reason: SessionRevocationReason): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: reason },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.store.closeSession(sessionId);
  }

  /**
   * Ends every session for a user, optionally sparing the one making the
   * request — used by "sign out everywhere else" and by password changes.
   */
  async revokeAllForUser(
    userId: string,
    reason: SessionRevocationReason,
    exceptSessionId?: string,
  ): Promise<number> {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      select: { id: true },
    });

    if (sessions.length === 0) return 0;

    const ids = sessions.map((session) => session.id);

    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { id: { in: ids } },
        data: { revokedAt: new Date(), revokedReason: reason },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId: { in: ids }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.store.closeSessions(ids);
    return ids.length;
  }

  /** The user's live sessions, newest activity first. */
  async list(userId: string, currentSessionId: string): Promise<SessionSummary[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        ipPrefix: true,
        userAgent: true,
      },
    });

    return sessions.map((session) => ({ ...session, isCurrent: session.id === currentSessionId }));
  }

  /**
   * Confirms a session belongs to a user before acting on it.
   *
   * The session id comes from a URL, so ownership is checked here rather than
   * trusted — revoking by id without this is a textbook IDOR.
   */
  async belongsTo(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });

    return session?.userId === userId;
  }

  /** Issues an access token and registers the session as live. */
  private async activate(sessionId: string, userId: string, expiresAt: Date): Promise<string> {
    const accessToken = this.tokens.generate();

    await this.store.openSession(sessionId, expiresAt);
    await this.store.storeAccessToken(accessToken, { sessionId, userId });

    return accessToken;
  }

  private async handleReuse(
    familyId: string,
    sessionId: string,
    userId: string,
    context: ClientContext,
  ): Promise<void> {
    const now = new Date();

    const sessions = await this.prisma.refreshToken.findMany({
      where: { familyId },
      select: { sessionId: true },
      distinct: ['sessionId'],
    });
    const sessionIds = sessions.map((token) => token.sessionId);

    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.session.updateMany({
        where: { id: { in: sessionIds }, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'REFRESH_REUSE_DETECTED' },
      }),
    ]);

    await this.store.closeSessions(sessionIds);

    // Operationally important: this is either a stolen token or a client bug,
    // and both are worth an alert. The family id is safe to log — it identifies
    // the chain without being a credential.
    this.logger.warn(
      { familyId, sessionId, userId, requestId: context.requestId },
      'Refresh token reuse detected; token family revoked',
    );

    await this.audit.record(
      {
        action: AUTH_ACTIONS.REFRESH_REUSE_DETECTED,
        actorId: userId,
        entityType: 'Session',
        entityId: sessionId,
        metadata: { familyId, revokedSessions: sessionIds.length },
      },
      context,
    );
  }
}
