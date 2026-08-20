import type { Locale } from '@afghan-it-academy/shared';
import { Inject, Injectable } from '@nestjs/common';

import type { ClientContext } from '../../../common/index.js';
import { ENV, type Env } from '../../../config/index.js';
import { PrismaService, toDomainLocale } from '../../../infrastructure/prisma/index.js';
import { AuditService } from '../../audit/index.js';
import { EMAIL_SENDER, type EmailSender } from '../../notifications/index.js';
import { AUTH_ACTIONS } from '../auth-actions.js';
import { PasswordService } from '../crypto/index.js';
import { SessionService, type IssuedSession } from '../sessions/index.js';
import { OneTimeTokenService } from '../tokens/index.js';
import { UserService, type AuthenticatableUser } from '../users/index.js';

/** Why a sign-in attempt was refused. Only ever revealed to a correct password. */
export type LoginRefusal =
  | 'invalid_credentials'
  | 'account_locked'
  | 'account_disabled'
  | 'email_not_verified';

export type LoginResult =
  | { readonly ok: true; readonly session: IssuedSession; readonly userId: string }
  | { readonly ok: false; readonly reason: LoginRefusal };

export type VerificationResult = { readonly ok: true } | { readonly ok: false };

/** Resends allowed per account per hour, independent of the requester's address. */
const MAX_VERIFICATION_RESENDS_PER_HOUR = 3;
const RESEND_WINDOW_MS = 60 * 60 * 1000;

/**
 * Registration, email verification and sign-in.
 *
 * ## The enumeration rule
 *
 * Registration and resend always report the same outcome whether or not the
 * address is known. Sign-in returns one indistinguishable failure for an unknown
 * account and for a wrong password, and only discloses account *state* —
 * locked, suspended, unverified — once the correct password has been supplied.
 *
 * That last part is the useful compromise. Telling everyone "this account is
 * locked" is an oracle; telling nobody leaves a legitimate user staring at
 * "wrong password" when their password is right. Requiring the password first
 * gives the honest message only to someone who already proved they own the
 * credential.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly oneTimeTokens: OneTimeTokenService,
    private readonly audit: AuditService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Creates an account and sends a verification link.
   *
   * Returns nothing on purpose: the caller responds identically whether the
   * address was free or already taken. A duplicate attempt is audited and the
   * existing owner is not emailed, so registration cannot be used to spam an
   * inbox either.
   */
  async register(
    input: { email: string; password: string; displayName: string; preferredLocale: Locale },
    context: ClientContext,
  ): Promise<void> {
    const normalised = UserService.normaliseEmail(input.email);

    const existing = await this.prisma.user.findUnique({
      where: { emailNormalized: normalised },
      select: { id: true },
    });

    if (existing) {
      // Hash anyway. Skipping the work here makes registration measurably
      // faster for taken addresses, which is the same oracle by another route.
      await this.passwords.hash(input.password);

      await this.audit.record(
        {
          action: AUTH_ACTIONS.REGISTER_DUPLICATE,
          actorId: existing.id,
          entityType: 'User',
          entityId: existing.id,
        },
        context,
      );
      return;
    }

    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.users.createWithDefaultRole({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      preferredLocale: input.preferredLocale,
    });

    await this.audit.record(
      {
        action: AUTH_ACTIONS.REGISTERED,
        actorId: user.id,
        entityType: 'User',
        entityId: user.id,
        metadata: { locale: input.preferredLocale },
      },
      context,
    );

    await this.sendVerificationEmail(
      user.id,
      input.email,
      input.displayName,
      input.preferredLocale,
      context,
    );
  }

  /** Redeems a verification link and activates the account. */
  async verifyEmail(rawToken: string, context: ClientContext): Promise<VerificationResult> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const redemption = await this.oneTimeTokens.redeem(rawToken, 'EMAIL_VERIFICATION', tx);
      if (!redemption.ok) return null;

      await this.users.markEmailVerified(redemption.userId, tx);
      return redemption.userId;
    });

    if (outcome === null) {
      await this.audit.record({ action: AUTH_ACTIONS.VERIFICATION_FAILED }, context);
      return { ok: false };
    }

    await this.audit.record(
      {
        action: AUTH_ACTIONS.EMAIL_VERIFIED,
        actorId: outcome,
        entityType: 'User',
        entityId: outcome,
      },
      context,
    );

    return { ok: true };
  }

  /**
   * Sends another verification link.
   *
   * Silent for unknown and already-verified addresses, and capped per account so
   * it cannot be used to flood one person's inbox — a limit per requesting
   * address would not stop that, since the attacker can change address freely.
   */
  async resendVerification(email: string, context: ClientContext): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: UserService.normaliseEmail(email) },
      select: {
        id: true,
        email: true,
        displayName: true,
        preferredLocale: true,
        emailVerifiedAt: true,
      },
    });

    // Silent for an unknown address and for an already-verified one alike, so
    // neither state is observable from the response.
    if (!user) return;
    if (user.emailVerifiedAt !== null) return;

    const recent = await this.oneTimeTokens.countRecent(
      user.id,
      'EMAIL_VERIFICATION',
      RESEND_WINDOW_MS,
    );
    if (recent >= MAX_VERIFICATION_RESENDS_PER_HOUR) return;

    await this.sendVerificationEmail(
      user.id,
      user.email,
      user.displayName,
      toDomainLocale(user.preferredLocale),
      context,
    );
  }

  /**
   * Authenticates and opens a session.
   *
   * The order is deliberate: the password is verified before any account state
   * is consulted, so the response cannot distinguish "no such account" from
   * "wrong password", and state is disclosed only to a correct credential.
   */
  async login(
    input: { email: string; password: string },
    context: ClientContext,
  ): Promise<LoginResult> {
    const user = await this.users.findForAuthentication(input.email);

    // PasswordService.verify spends equivalent time on a null digest, so an
    // unknown address costs the same as a known one.
    const passwordMatches = await this.passwords.verify(user?.passwordHash ?? null, input.password);

    if (!user || !passwordMatches) {
      if (user) await this.registerFailure(user, context);
      else
        await this.audit.record(
          { action: AUTH_ACTIONS.LOGIN_FAILED, metadata: { reason: 'unknown_account' } },
          context,
        );

      return { ok: false, reason: 'invalid_credentials' };
    }

    const refusal = this.refusalFor(user);
    if (refusal) {
      await this.audit.record(
        {
          action: AUTH_ACTIONS.LOGIN_BLOCKED,
          actorId: user.id,
          entityType: 'User',
          entityId: user.id,
          metadata: { reason: refusal },
        },
        context,
      );
      return { ok: false, reason: refusal };
    }

    // A correct password is the moment to upgrade a digest hashed under weaker
    // parameters — it is the only time the plaintext is available.
    if (user.passwordHash && this.passwords.needsRehash(user.passwordHash)) {
      await this.users.updatePasswordHash(user.id, await this.passwords.hash(input.password));
    }

    const session = await this.sessions.create(user.id, context);
    await this.users.recordSuccessfulLogin(user.id);

    await this.audit.record(
      {
        action: AUTH_ACTIONS.LOGIN_SUCCEEDED,
        actorId: user.id,
        entityType: 'Session',
        entityId: session.sessionId,
      },
      context,
    );

    return { ok: true, session, userId: user.id };
  }

  /** Ends the current session. */
  async logout(sessionId: string, userId: string, context: ClientContext): Promise<void> {
    await this.sessions.revoke(sessionId, 'USER_LOGOUT');

    await this.audit.record(
      {
        action: AUTH_ACTIONS.LOGOUT,
        actorId: userId,
        entityType: 'Session',
        entityId: sessionId,
      },
      context,
    );
  }

  private refusalFor(user: AuthenticatableUser): LoginRefusal | null {
    if (this.users.isLocked(user)) return 'account_locked';
    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') return 'account_disabled';
    if (user.emailVerifiedAt === null) return 'email_not_verified';
    return null;
  }

  private async registerFailure(user: AuthenticatableUser, context: ClientContext): Promise<void> {
    const { locked } = await this.users.recordFailedLogin(user.id);

    await this.audit.record(
      {
        action: AUTH_ACTIONS.LOGIN_FAILED,
        actorId: user.id,
        entityType: 'User',
        entityId: user.id,
        metadata: { reason: 'bad_password' },
      },
      context,
    );

    if (locked) {
      await this.audit.record(
        {
          action: AUTH_ACTIONS.ACCOUNT_LOCKED,
          actorId: user.id,
          entityType: 'User',
          entityId: user.id,
        },
        context,
      );
    }
  }

  private async sendVerificationEmail(
    userId: string,
    email: string,
    displayName: string,
    locale: Locale,
    context: ClientContext,
  ): Promise<void> {
    const issued = await this.oneTimeTokens.issue(
      userId,
      'EMAIL_VERIFICATION',
      this.users.verificationTtlMs,
      context.ipPrefix,
    );

    const link = new URL(`/${locale}/verify-email`, this.env.WEB_APP_URL);
    link.searchParams.set('token', issued.token);

    await this.email.send({
      to: email,
      locale,
      template: 'email-verification',
      variables: { displayName, verificationUrl: link.toString() },
    });

    await this.audit.record(
      {
        action: AUTH_ACTIONS.VERIFICATION_SENT,
        actorId: userId,
        entityType: 'User',
        entityId: userId,
      },
      context,
    );
  }
}
