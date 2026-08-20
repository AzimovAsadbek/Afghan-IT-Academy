import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infrastructure/prisma/index.js';
import { OneTimeTokenService } from '../src/modules/identity/index.js';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Verification and reset tokens against a real database.
 *
 * Single-use enforcement is a conditional UPDATE, so it can only be shown to
 * work by racing it. Purpose isolation likewise depends on a real row.
 */
describe('One-time tokens (e2e)', () => {
  let moduleRef: TestingModule | undefined;
  let tokens: OneTimeTokenService;
  let prisma: PrismaService;
  let userId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();

    tokens = moduleRef.get(OneTimeTokenService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { emailNormalized: { startsWith: 'ott-e2e' } } });
    await moduleRef?.close();
  });

  beforeEach(async () => {
    const address = `ott-e2e-${String(Date.now())}-${Math.random().toString(36).slice(2)}@example.test`;
    const user = await prisma.user.create({
      data: { email: address, emailNormalized: address, displayName: 'Token Test' },
      select: { id: true },
    });
    userId = user.id;
  });

  describe('issuing', () => {
    it('stores only the digest, never the token', async () => {
      const issued = await tokens.issue(userId, 'EMAIL_VERIFICATION', HOUR_MS, null);

      const rows = await prisma.oneTimeToken.findMany({
        where: { userId },
        select: { tokenHash: true },
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.tokenHash).not.toBe(issued.token);
      expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('supersedes an outstanding token for the same purpose', async () => {
      const first = await tokens.issue(userId, 'EMAIL_VERIFICATION', HOUR_MS, null);
      await tokens.issue(userId, 'EMAIL_VERIFICATION', HOUR_MS, null);

      // Otherwise every resend leaves another live credential in another copy
      // of the inbox.
      expect(await tokens.redeem(first.token, 'EMAIL_VERIFICATION')).toEqual({
        ok: false,
        reason: 'consumed',
      });
    });

    it('leaves a token for a different purpose alone', async () => {
      const verification = await tokens.issue(userId, 'EMAIL_VERIFICATION', HOUR_MS, null);
      await tokens.issue(userId, 'PASSWORD_RESET', HOUR_MS, null);

      expect(await tokens.redeem(verification.token, 'EMAIL_VERIFICATION')).toEqual({
        ok: true,
        userId,
      });
    });

    it('records only the network prefix of the requester', async () => {
      await tokens.issue(userId, 'PASSWORD_RESET', HOUR_MS, '203.0.113.0/24');

      const row = await prisma.oneTimeToken.findFirstOrThrow({
        where: { userId },
        select: { requestIpPrefix: true },
      });

      expect(row.requestIpPrefix).toBe('203.0.113.0/24');
    });
  });

  describe('redeeming', () => {
    it('accepts a valid token once', async () => {
      const issued = await tokens.issue(userId, 'EMAIL_VERIFICATION', HOUR_MS, null);
      expect(await tokens.redeem(issued.token, 'EMAIL_VERIFICATION')).toEqual({ ok: true, userId });
    });

    it('refuses the same token a second time', async () => {
      const issued = await tokens.issue(userId, 'EMAIL_VERIFICATION', HOUR_MS, null);
      await tokens.redeem(issued.token, 'EMAIL_VERIFICATION');

      expect(await tokens.redeem(issued.token, 'EMAIL_VERIFICATION')).toEqual({
        ok: false,
        reason: 'consumed',
      });
    });

    /**
     * A verification link must not be usable to reset a password. Without the
     * purpose check, anyone who can read a verification email could set a new
     * password on that account.
     */
    it('refuses a token presented for the wrong purpose', async () => {
      const issued = await tokens.issue(userId, 'EMAIL_VERIFICATION', HOUR_MS, null);

      expect(await tokens.redeem(issued.token, 'PASSWORD_RESET')).toEqual({
        ok: false,
        reason: 'unknown',
      });

      // And the token survives the attempt, so a wrong guess does not burn it.
      expect(await tokens.redeem(issued.token, 'EMAIL_VERIFICATION')).toEqual({ ok: true, userId });
    });

    it('refuses an expired token', async () => {
      const issued = await tokens.issue(userId, 'PASSWORD_RESET', 1, null);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(await tokens.redeem(issued.token, 'PASSWORD_RESET')).toEqual({
        ok: false,
        reason: 'expired',
      });
    });

    it('refuses a fabricated token', async () => {
      expect(await tokens.redeem('never-issued', 'EMAIL_VERIFICATION')).toEqual({
        ok: false,
        reason: 'unknown',
      });
    });

    /**
     * Two simultaneous submissions of the same reset link must not both
     * succeed — that is two parties setting a password on one account.
     */
    it('allows exactly one winner when redeemed concurrently', async () => {
      const issued = await tokens.issue(userId, 'PASSWORD_RESET', HOUR_MS, null);

      const results = await Promise.all([
        tokens.redeem(issued.token, 'PASSWORD_RESET'),
        tokens.redeem(issued.token, 'PASSWORD_RESET'),
        tokens.redeem(issued.token, 'PASSWORD_RESET'),
      ]);

      expect(results.filter((result) => result.ok)).toHaveLength(1);
    });
  });

  describe('throttling support', () => {
    it('counts recent issues for a purpose', async () => {
      await tokens.issue(userId, 'PASSWORD_RESET', HOUR_MS, null);
      await tokens.issue(userId, 'PASSWORD_RESET', HOUR_MS, null);
      await tokens.issue(userId, 'EMAIL_VERIFICATION', HOUR_MS, null);

      expect(await tokens.countRecent(userId, 'PASSWORD_RESET', HOUR_MS)).toBe(2);
      expect(await tokens.countRecent(userId, 'EMAIL_VERIFICATION', HOUR_MS)).toBe(1);
    });

    it('ignores issues outside the window', async () => {
      await tokens.issue(userId, 'PASSWORD_RESET', HOUR_MS, null);
      expect(await tokens.countRecent(userId, 'PASSWORD_RESET', 1)).toBe(0);
    });
  });

  describe('retention', () => {
    it('purges expired and consumed tokens', async () => {
      const consumed = await tokens.issue(userId, 'EMAIL_VERIFICATION', HOUR_MS, null);
      await tokens.redeem(consumed.token, 'EMAIL_VERIFICATION');

      const purged = await tokens.purgeExpired(new Date(Date.now() + HOUR_MS));

      expect(purged).toBeGreaterThan(0);
      expect(await prisma.oneTimeToken.count({ where: { userId } })).toBe(0);
    });
  });
});
