import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

/**
 * 256 bits. Enough that guessing is not a strategy, and it survives being
 * base64url-encoded into a URL without wrapping awkwardly in an email client.
 */
const TOKEN_BYTES = 32;

/**
 * Opaque token generation and storage hashing.
 *
 * Every long-lived credential in this system — refresh tokens, email
 * verification links, password reset links — follows the same rule: the raw
 * value exists only in transit, and only its SHA-256 digest is persisted.
 *
 * SHA-256 rather than argon2 here, deliberately. These tokens are 256 bits of
 * `randomBytes`, not human-chosen secrets, so there is no dictionary to
 * accelerate and a slow KDF would buy nothing while adding real cost to every
 * refresh. Argon2 protects *low-entropy* inputs; that is not this.
 */
@Injectable()
export class TokenService {
  /**
   * A fresh token. base64url so it is safe in a URL path, a query string and a
   * cookie value without further encoding.
   */
  generate(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }

  /** The value stored in the database. Never store the token itself. */
  hash(rawToken: string): string {
    return createHash('sha256').update(rawToken, 'utf8').digest('hex');
  }

  /**
   * Compares a presented token against a stored digest in constant time.
   *
   * Lookups are done by indexed hash equality, so this is defence in depth
   * rather than the primary path — but where a comparison does happen, a
   * short-circuiting `===` leaks a prefix match through timing.
   */
  matches(rawToken: string, storedDigest: string): boolean {
    const presented = Buffer.from(this.hash(rawToken), 'utf8');
    const stored = Buffer.from(storedDigest, 'utf8');

    // timingSafeEqual throws on a length mismatch, which would itself be a
    // signal; both sides are fixed-length hex digests, so a differing length
    // means a malformed stored value.
    if (presented.length !== stored.length) return false;

    return timingSafeEqual(presented, stored);
  }
}
