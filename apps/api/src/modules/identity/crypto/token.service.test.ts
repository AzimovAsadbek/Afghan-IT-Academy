import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { TokenService } from './token.service.js';

describe('TokenService', () => {
  const service = new TokenService();

  describe('generate', () => {
    it('produces 256 bits of entropy', () => {
      // base64url of 32 bytes is 43 characters with no padding.
      expect(Buffer.from(service.generate(), 'base64url')).toHaveLength(32);
    });

    it('produces URL-safe values needing no further encoding', () => {
      for (let i = 0; i < 200; i += 1) {
        const token = service.generate();
        expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(encodeURIComponent(token)).toBe(token);
      }
    });

    it('never repeats', () => {
      const tokens = new Set(Array.from({ length: 1_000 }, () => service.generate()));
      expect(tokens.size).toBe(1_000);
    });
  });

  describe('hash', () => {
    it('is SHA-256 of the raw token', () => {
      const token = service.generate();
      const expected = createHash('sha256').update(token, 'utf8').digest('hex');
      expect(service.hash(token)).toBe(expected);
    });

    it('is deterministic, so a lookup by digest finds the row', () => {
      const token = service.generate();
      expect(service.hash(token)).toBe(service.hash(token));
    });

    it('never contains the raw token', () => {
      const token = service.generate();
      expect(service.hash(token)).not.toContain(token);
    });

    it('differs for tokens differing by one character', () => {
      const a = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const b = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab';
      expect(service.hash(a)).not.toBe(service.hash(b));
    });
  });

  describe('matches', () => {
    it('accepts the token that produced the digest', () => {
      const token = service.generate();
      expect(service.matches(token, service.hash(token))).toBe(true);
    });

    it('rejects a different token', () => {
      const token = service.generate();
      expect(service.matches(service.generate(), service.hash(token))).toBe(false);
    });

    it('rejects a malformed stored digest without throwing', () => {
      // timingSafeEqual throws on differing lengths; a truncated column value
      // must be a failed match, not a 500.
      const token = service.generate();
      expect(service.matches(token, 'too-short')).toBe(false);
      expect(service.matches(token, '')).toBe(false);
    });

    it('rejects an empty token', () => {
      const token = service.generate();
      expect(service.matches('', service.hash(token))).toBe(false);
    });
  });
});
