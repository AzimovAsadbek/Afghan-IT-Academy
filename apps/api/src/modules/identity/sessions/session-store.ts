import { Inject, Injectable } from '@nestjs/common';

import { ENV, type Env } from '../../../config/index.js';
import { RedisService } from '../../../infrastructure/redis/index.js';
import { TokenService } from '../crypto/index.js';

/** What an access token resolves to. Kept minimal — it is read on every request. */
export interface ActiveSession {
  readonly sessionId: string;
  readonly userId: string;
}

/**
 * Redis-backed access-token store.
 *
 * ## Why two keys
 *
 * `access:<digest>` maps a token to its session and expires on its own short
 * TTL. `live:<sessionId>` exists for as long as the session is valid.
 *
 * Validation requires both. That is what makes revocation instant without
 * tracking every token a session ever issued: deleting the single `live:` key
 * invalidates every outstanding access token for that session at once, and the
 * `access:` keys expire on their own shortly after.
 *
 * The alternative — enumerating and deleting a session's access tokens — needs a
 * set that grows with every refresh and must be cleaned up. This does not.
 *
 * Both lookups are pipelined into one round trip, so the per-request cost is a
 * single Redis call.
 */
@Injectable()
export class SessionStore {
  private readonly accessTtlSeconds: number;
  private readonly sessionTtlSeconds: number;

  constructor(
    private readonly redis: RedisService,
    private readonly tokens: TokenService,
    @Inject(ENV) env: Env,
  ) {
    this.accessTtlSeconds = env.AUTH_ACCESS_TOKEN_TTL_SECONDS;
    this.sessionTtlSeconds = env.AUTH_SESSION_ABSOLUTE_TTL_SECONDS;
  }

  /** Marks a session live. Called once when the session is created. */
  async openSession(sessionId: string, expiresAt: Date): Promise<void> {
    const ttl = this.secondsUntil(expiresAt, this.sessionTtlSeconds);
    await this.redis.client.set(this.liveKey(sessionId), '1', 'EX', ttl);
  }

  /**
   * Binds an access token to a session.
   *
   * Only the digest is stored: Redis persistence and any memory dump would
   * otherwise contain usable credentials.
   */
  async storeAccessToken(rawToken: string, session: ActiveSession): Promise<void> {
    await this.redis.client.set(
      this.accessKey(rawToken),
      `${session.sessionId}:${session.userId}`,
      'EX',
      this.accessTtlSeconds,
    );
  }

  /**
   * Resolves an access token, or null when it is unknown, expired, or its
   * session has been revoked.
   */
  async resolve(rawToken: string): Promise<ActiveSession | null> {
    const accessKey = this.accessKey(rawToken);

    // Read the token binding first; the session's liveness is checked against
    // whatever it points at. Pipelining both would require knowing the session
    // id up front, so this is one round trip for the binding and one for the
    // liveness check — only on requests that present a token at all.
    const binding = await this.redis.client.get(accessKey);
    if (binding === null) return null;

    const separator = binding.indexOf(':');
    if (separator < 1) return null;

    const sessionId = binding.slice(0, separator);
    const userId = binding.slice(separator + 1);
    if (userId.length === 0) return null;

    const live = await this.redis.client.exists(this.liveKey(sessionId));
    if (live === 0) {
      // The session was revoked. Drop the dangling token rather than leaving it
      // to expire, so a replay does not even reach the liveness check.
      await this.redis.client.del(accessKey);
      return null;
    }

    return { sessionId, userId };
  }

  /**
   * Ends a session. Every access token issued for it stops resolving on the
   * next request; no enumeration required.
   */
  async closeSession(sessionId: string): Promise<void> {
    await this.redis.client.del(this.liveKey(sessionId));
  }

  async closeSessions(sessionIds: readonly string[]): Promise<void> {
    if (sessionIds.length === 0) return;
    await this.redis.client.del(...sessionIds.map((id) => this.liveKey(id)));
  }

  /** Invalidates a single access token, e.g. on logout, without waiting for TTL. */
  async discardAccessToken(rawToken: string): Promise<void> {
    await this.redis.client.del(this.accessKey(rawToken));
  }

  private accessKey(rawToken: string): string {
    return `session:access:${this.tokens.hash(rawToken)}`;
  }

  private liveKey(sessionId: string): string {
    return `session:live:${sessionId}`;
  }

  /** Clamped so a clock skew or a stale row cannot produce a non-positive TTL. */
  private secondsUntil(when: Date, fallback: number): number {
    const seconds = Math.ceil((when.getTime() - Date.now()) / 1000);
    return seconds > 0 ? Math.min(seconds, fallback) : fallback;
  }
}
