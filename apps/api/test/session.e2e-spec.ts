import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import type { ClientContext } from '../src/common/index.js';
import { SessionService } from '../src/modules/identity/index.js';
import { PrismaService } from '../src/infrastructure/prisma/index.js';

/**
 * Session lifecycle against real Postgres and Redis.
 *
 * These behaviours cannot be meaningfully tested against mocks: rotation
 * correctness depends on a conditional UPDATE actually being atomic, and
 * revocation depends on Redis and Postgres agreeing. A mock would assert that
 * the code calls the methods it calls, which is not the property that matters.
 *
 *   pnpm db:up && pnpm --filter @afghan-it-academy/api test:e2e
 */
describe('Sessions (e2e)', () => {
  let moduleRef: TestingModule | undefined;
  let sessions: SessionService;
  let prisma: PrismaService;
  let userId: string;

  const context: ClientContext = {
    ipPrefix: '203.0.113.0/24',
    userAgent: 'vitest',
    requestId: 'session-e2e',
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();

    sessions = moduleRef.get(SessionService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.deleteMany({ where: { emailNormalized: { startsWith: 'session-e2e' } } });
    }
    await moduleRef?.close();
  });

  beforeEach(async () => {
    // A fresh account per test keeps session state from leaking between cases.
    const unique = `session-e2e-${String(Date.now())}-${Math.random().toString(36).slice(2)}@example.test`;
    const user = await prisma.user.create({
      data: {
        email: unique,
        emailNormalized: unique,
        displayName: 'Session Test',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    userId = user.id;
  });

  describe('creation', () => {
    it('issues an access token that resolves to the session and user', async () => {
      const issued = await sessions.create(userId, context);

      const resolved = await sessions.resolveAccessToken(issued.accessToken);

      expect(resolved).toEqual({ sessionId: issued.sessionId, userId });
    });

    it('stores only the refresh token digest, never the token', async () => {
      const issued = await sessions.create(userId, context);

      const stored = await prisma.refreshToken.findMany({
        where: { sessionId: issued.sessionId },
        select: { tokenHash: true },
      });

      expect(stored).toHaveLength(1);
      expect(stored[0]?.tokenHash).not.toBe(issued.refreshToken);
      expect(stored[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('records the network prefix rather than a full address', async () => {
      const issued = await sessions.create(userId, context);

      const session = await prisma.session.findUniqueOrThrow({
        where: { id: issued.sessionId },
        select: { ipPrefix: true },
      });

      expect(session.ipPrefix).toBe('203.0.113.0/24');
    });

    it('rejects an unknown access token', async () => {
      expect(await sessions.resolveAccessToken('not-a-real-token')).toBeNull();
    });
  });

  describe('rotation', () => {
    it('issues a new pair and invalidates the presented refresh token', async () => {
      const first = await sessions.create(userId, context);

      const result = await sessions.refresh(first.refreshToken, context);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.session.refreshToken).not.toBe(first.refreshToken);
      expect(result.session.accessToken).not.toBe(first.accessToken);
      // Same session; rotation does not sign the user out of their device.
      expect(result.session.sessionId).toBe(first.sessionId);
    });

    it('keeps the rotated refresh token usable', async () => {
      const first = await sessions.create(userId, context);
      const second = await sessions.refresh(first.refreshToken, context);
      expect(second.ok).toBe(true);
      if (!second.ok) return;

      const third = await sessions.refresh(second.session.refreshToken, context);
      expect(third.ok).toBe(true);
    });

    it('advances lastSeenAt so the session list reflects real activity', async () => {
      const first = await sessions.create(userId, context);
      const before = await prisma.session.findUniqueOrThrow({
        where: { id: first.sessionId },
        select: { lastSeenAt: true },
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      await sessions.refresh(first.refreshToken, context);

      const after = await prisma.session.findUniqueOrThrow({
        where: { id: first.sessionId },
        select: { lastSeenAt: true },
      });

      expect(after.lastSeenAt.getTime()).toBeGreaterThan(before.lastSeenAt.getTime());
    });

    it('rejects a refresh token that was never issued', async () => {
      const result = await sessions.refresh('fabricated-token', context);
      expect(result).toEqual({ ok: false, reason: 'unknown' });
    });
  });

  describe('reuse detection', () => {
    it('refuses a refresh token presented a second time', async () => {
      const first = await sessions.create(userId, context);
      await sessions.refresh(first.refreshToken, context);

      const replay = await sessions.refresh(first.refreshToken, context);

      expect(replay).toEqual({ ok: false, reason: 'reused' });
    });

    it('revokes the whole family, not just the replayed token', async () => {
      const first = await sessions.create(userId, context);
      const second = await sessions.refresh(first.refreshToken, context);
      expect(second.ok).toBe(true);
      if (!second.ok) return;

      // An attacker replays the stolen first token.
      await sessions.refresh(first.refreshToken, context);

      // The legitimate client's current token is now dead too. That is the
      // point: we cannot tell which party is genuine, so the chain ends.
      const afterReuse = await sessions.refresh(second.session.refreshToken, context);
      expect(afterReuse.ok).toBe(false);
    });

    it('ends the session, so outstanding access tokens stop working immediately', async () => {
      const first = await sessions.create(userId, context);
      const second = await sessions.refresh(first.refreshToken, context);
      expect(second.ok).toBe(true);
      if (!second.ok) return;

      expect(await sessions.resolveAccessToken(second.session.accessToken)).not.toBeNull();

      await sessions.refresh(first.refreshToken, context);

      expect(await sessions.resolveAccessToken(second.session.accessToken)).toBeNull();
    });

    it('marks the session with the reuse reason for support to read', async () => {
      const first = await sessions.create(userId, context);
      await sessions.refresh(first.refreshToken, context);
      await sessions.refresh(first.refreshToken, context);

      const session = await prisma.session.findUniqueOrThrow({
        where: { id: first.sessionId },
        select: { revokedAt: true, revokedReason: true },
      });

      expect(session.revokedAt).not.toBeNull();
      expect(session.revokedReason).toBe('REFRESH_REUSE_DETECTED');
    });

    it('writes an audit record naming the family', async () => {
      const first = await sessions.create(userId, context);
      await sessions.refresh(first.refreshToken, context);
      await sessions.refresh(first.refreshToken, context);

      const entry = await prisma.auditLog.findFirst({
        where: { actorId: userId, action: 'auth.refresh.reuse_detected' },
      });

      expect(entry).not.toBeNull();
      // The audit row must describe the event without containing a credential.
      expect(JSON.stringify(entry?.metadata)).not.toContain(first.refreshToken);
    });

    /**
     * Two tabs refreshing at once must not both succeed. Without the atomic
     * claim, both transactions read `usedAt IS NULL` and both mint a pair,
     * leaving two live chains from one token.
     */
    it('allows exactly one winner when the same token is refreshed concurrently', async () => {
      const first = await sessions.create(userId, context);

      const results = await Promise.all([
        sessions.refresh(first.refreshToken, context),
        sessions.refresh(first.refreshToken, context),
        sessions.refresh(first.refreshToken, context),
      ]);

      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toHaveLength(2);
    });
  });

  describe('revocation', () => {
    it('invalidates the access token immediately', async () => {
      const issued = await sessions.create(userId, context);
      expect(await sessions.resolveAccessToken(issued.accessToken)).not.toBeNull();

      await sessions.revoke(issued.sessionId, 'USER_LOGOUT');

      expect(await sessions.resolveAccessToken(issued.accessToken)).toBeNull();
    });

    it('invalidates the refresh token too', async () => {
      const issued = await sessions.create(userId, context);
      await sessions.revoke(issued.sessionId, 'USER_LOGOUT');

      const result = await sessions.refresh(issued.refreshToken, context);
      expect(result).toEqual({ ok: false, reason: 'revoked' });
    });

    it('ends every other session but spares the current one', async () => {
      const current = await sessions.create(userId, context);
      const phone = await sessions.create(userId, context);
      const tablet = await sessions.create(userId, context);

      const revoked = await sessions.revokeAllForUser(
        userId,
        'PASSWORD_CHANGED',
        current.sessionId,
      );

      expect(revoked).toBe(2);
      expect(await sessions.resolveAccessToken(current.accessToken)).not.toBeNull();
      expect(await sessions.resolveAccessToken(phone.accessToken)).toBeNull();
      expect(await sessions.resolveAccessToken(tablet.accessToken)).toBeNull();
    });

    it('ends every session when no exception is given', async () => {
      await sessions.create(userId, context);
      const second = await sessions.create(userId, context);

      expect(await sessions.revokeAllForUser(userId, 'USER_LOGOUT_ALL')).toBe(2);
      expect(await sessions.resolveAccessToken(second.accessToken)).toBeNull();
    });
  });

  describe('listing and ownership', () => {
    it('lists live sessions and flags the current one', async () => {
      const current = await sessions.create(userId, context);
      await sessions.create(userId, context);

      const listed = await sessions.list(userId, current.sessionId);

      expect(listed).toHaveLength(2);
      expect(listed.filter((session) => session.isCurrent)).toHaveLength(1);
      expect(listed.find((session) => session.isCurrent)?.id).toBe(current.sessionId);
    });

    it('omits revoked sessions', async () => {
      const kept = await sessions.create(userId, context);
      const dropped = await sessions.create(userId, context);
      await sessions.revoke(dropped.sessionId, 'USER_LOGOUT');

      const listed = await sessions.list(userId, kept.sessionId);

      expect(listed.map((session) => session.id)).toEqual([kept.sessionId]);
    });

    it('never exposes a token in a session summary', async () => {
      const issued = await sessions.create(userId, context);
      const listed = await sessions.list(userId, issued.sessionId);

      const serialised = JSON.stringify(listed);
      expect(serialised).not.toContain(issued.accessToken);
      expect(serialised).not.toContain(issued.refreshToken);
    });

    /** Guards against IDOR: a session id from a URL proves nothing about who owns it. */
    it('reports a session as not belonging to a different user', async () => {
      const issued = await sessions.create(userId, context);

      const stranger = `session-e2e-other-${String(Date.now())}@example.test`;
      const other = await prisma.user.create({
        data: {
          email: stranger,
          emailNormalized: stranger,
          displayName: 'Someone Else',
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      // The stranger cannot revoke it, and the attempt leaves it alive.
      expect(await sessions.revokeOwned(issued.sessionId, other.id, 'USER_LOGOUT')).toBe(false);
      expect(await sessions.resolveAccessToken(issued.accessToken)).not.toBeNull();

      // The owner can.
      expect(await sessions.revokeOwned(issued.sessionId, userId, 'USER_LOGOUT')).toBe(true);
      expect(await sessions.resolveAccessToken(issued.accessToken)).toBeNull();
    });

    it('refuses to revoke a session that does not exist', async () => {
      expect(await sessions.revokeOwned('does-not-exist', userId, 'USER_LOGOUT')).toBe(false);
    });

    /**
     * A second revoke must report false rather than succeeding twice, so the
     * endpoint cannot be used to probe which ids were once real.
     */
    it('refuses to revoke a session that is already revoked', async () => {
      const issued = await sessions.create(userId, context);

      expect(await sessions.revokeOwned(issued.sessionId, userId, 'USER_LOGOUT')).toBe(true);
      expect(await sessions.revokeOwned(issued.sessionId, userId, 'USER_LOGOUT')).toBe(false);
    });
  });
});
