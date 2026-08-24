import { beforeAll, describe, expect, it } from 'vitest';

import type { Env } from '../../../config/index.js';
import { PasswordService } from './password.service.js';

/**
 * The OWASP baseline is used here rather than a deliberately cheap setting.
 * Testing with weaker parameters than production would leave the real cost
 * unmeasured, and these tests are the only place the hashing cost is exercised
 * before it reaches a login handler.
 */
const env = {
  AUTH_ARGON2_MEMORY_KIB: 19_456,
  AUTH_ARGON2_TIME_COST: 2,
  AUTH_ARGON2_PARALLELISM: 1,
} as unknown as Env;

const PASSWORD = 'correct horse battery staple';

describe('PasswordService', () => {
  const service = new PasswordService(env);

  beforeAll(async () => {
    await service.onModuleInit();
  });

  describe('hashing', () => {
    it('produces an argon2id digest with the configured parameters', async () => {
      const digest = await service.hash(PASSWORD);
      expect(digest).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    });

    it('never embeds the password in the digest', async () => {
      const digest = await service.hash(PASSWORD);
      expect(digest).not.toContain(PASSWORD);
      expect(digest).not.toContain('correct');
    });

    it('salts each digest, so identical passwords hash differently', async () => {
      const [first, second] = await Promise.all([service.hash(PASSWORD), service.hash(PASSWORD)]);
      expect(first).not.toBe(second);
    });
  });

  describe('verification', () => {
    it('accepts the correct password', async () => {
      const digest = await service.hash(PASSWORD);
      expect(await service.verify(digest, PASSWORD)).toBe(true);
    });

    it('rejects a wrong password', async () => {
      const digest = await service.hash(PASSWORD);
      expect(await service.verify(digest, 'not the password at all')).toBe(false);
    });

    it('rejects a password differing only in case', async () => {
      const digest = await service.hash(PASSWORD);
      expect(await service.verify(digest, PASSWORD.toUpperCase())).toBe(false);
    });

    it('returns false for a null digest instead of throwing', async () => {
      // The account does not exist, or is federated-only. The caller must not
      // have to special-case this, or one caller eventually forgets.
      expect(await service.verify(null, PASSWORD)).toBe(false);
    });

    it('returns false for a corrupt digest rather than propagating an error', async () => {
      expect(await service.verify('not-a-digest', PASSWORD)).toBe(false);
    });

    /**
     * Guards the anti-enumeration property. If verifying a null digest returned
     * immediately, login response time would disclose whether an email is
     * registered — an oracle that no amount of identical error messaging fixes.
     *
     * Asserted as a ratio against the real verify cost rather than an absolute
     * millisecond figure, so it holds on slow CI runners too.
     */
    it('spends comparable time when there is no account to verify against', async () => {
      const digest = await service.hash(PASSWORD);

      const timeOf = async (run: () => Promise<unknown>): Promise<number> => {
        const started = performance.now();
        // Several iterations so scheduler noise does not dominate.
        for (let i = 0; i < 5; i += 1) await run();
        return performance.now() - started;
      };

      const existingAccount = await timeOf(() => service.verify(digest, 'wrong password'));
      const unknownAccount = await timeOf(() => service.verify(null, 'wrong password'));

      const ratio = unknownAccount / existingAccount;
      expect(ratio, `unknown/${existingAccount.toFixed(0)}ms vs existing`).toBeGreaterThan(0.4);
      expect(ratio).toBeLessThan(2.5);
    });
  });

  describe('needsRehash', () => {
    it('is false for a digest at the current parameters', async () => {
      const digest = await service.hash(PASSWORD);
      expect(service.needsRehash(digest)).toBe(false);
    });

    it('is true for a digest hashed with less memory', () => {
      expect(service.needsRehash('$argon2id$v=19$m=4096,t=2,p=1$abc$def')).toBe(true);
    });

    it('is true for a digest hashed with fewer passes', () => {
      expect(service.needsRehash('$argon2id$v=19$m=19456,t=1,p=1$abc$def')).toBe(true);
    });

    it('is false for a digest stronger than the current parameters', () => {
      expect(service.needsRehash('$argon2id$v=19$m=65536,t=3,p=1$abc$def')).toBe(false);
    });

    it('is true for an unparseable digest, so bad records get replaced', () => {
      expect(service.needsRehash('$2b$12$bcryptstylehash')).toBe(true);
      expect(service.needsRehash('')).toBe(true);
    });
  });
});
