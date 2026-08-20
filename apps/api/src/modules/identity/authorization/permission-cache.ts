import type { PermissionKey } from '@afghan-it-academy/shared';
import { Injectable } from '@nestjs/common';

import { RedisService } from '../../../infrastructure/redis/index.js';

/**
 * How long a resolved permission set may be reused.
 *
 * Sixty seconds is the deliberate ceiling on stale authorization. Any longer and
 * revoking a capability stops feeling immediate, which would give back exactly
 * the weakness that opaque sessions were chosen to avoid (ADR 0006). Any shorter
 * and the cache stops earning its place — the join it replaces runs on every
 * authenticated request.
 *
 * The TTL is a backstop, not the mechanism: every write that changes a user's
 * effective permissions invalidates their entry directly.
 */
const CACHE_TTL_SECONDS = 60;

/**
 * Caches effective permissions per user.
 *
 * Without this, every authenticated request runs a three-table join to answer a
 * question whose answer changes a few times a year.
 */
@Injectable()
export class PermissionCache {
  constructor(private readonly redis: RedisService) {}

  async get(userId: string): Promise<PermissionKey[] | null> {
    const cached = await this.redis.client.get(this.key(userId));
    if (cached === null) return null;

    try {
      const parsed: unknown = JSON.parse(cached);
      // A malformed entry is treated as a miss rather than trusted: this value
      // decides authorization, so "parse loosely" is the wrong instinct.
      if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
        return null;
      }
      return parsed as PermissionKey[];
    } catch {
      return null;
    }
  }

  async set(userId: string, permissions: readonly PermissionKey[]): Promise<void> {
    await this.redis.client.set(
      this.key(userId),
      JSON.stringify(permissions),
      'EX',
      CACHE_TTL_SECONDS,
    );
  }

  /**
   * Drops a user's cached permissions.
   *
   * Must be called by every write that changes what a user may do — role grants
   * and revocations, suspensions, reactivations. Relying on the TTL instead
   * would leave a revoked capability live for up to a minute, and "up to a
   * minute" is exactly the window an administrator revoking access in an
   * incident cannot accept.
   */
  async invalidate(userId: string): Promise<void> {
    await this.redis.client.del(this.key(userId));
  }

  private key(userId: string): string {
    return `identity:permissions:${userId}`;
  }
}
