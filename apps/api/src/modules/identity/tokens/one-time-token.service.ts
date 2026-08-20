import { Injectable } from '@nestjs/common';

import type { OneTimeTokenPurpose, PrismaClient } from '../../../../generated/prisma/index.js';
import {
  PrismaService,
  type PrismaTransactionClient,
} from '../../../infrastructure/prisma/index.js';
import { TokenService } from '../crypto/index.js';

export interface IssuedOneTimeToken {
  /** The raw value. Exists here and in the email, nowhere else. */
  readonly token: string;
  readonly expiresAt: Date;
}

export type RedemptionFailure = 'unknown' | 'expired' | 'consumed';

export type RedemptionResult =
  | { readonly ok: true; readonly userId: string }
  | { readonly ok: false; readonly reason: RedemptionFailure };

/**
 * Single-use tokens for email verification and password reset.
 *
 * Both flows are the same mechanism with a different purpose, so they share one
 * implementation: issuing, hashing, expiry and single-use enforcement are
 * exactly the properties that go quietly wrong when duplicated.
 *
 * The raw token is returned to the caller once and never stored. A database
 * disclosure yields digests, which cannot be presented to redeem anything.
 */
@Injectable()
export class OneTimeTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Issues a token, invalidating any outstanding ones for the same purpose.
   *
   * Superseding matters: without it, every "resend verification" click leaves
   * another live credential in another inbox copy, and a mailbox compromised
   * later still yields a working link.
   */
  async issue(
    userId: string,
    purpose: OneTimeTokenPurpose,
    ttlMs: number,
    ipPrefix: string | null,
  ): Promise<IssuedOneTimeToken> {
    const token = this.tokens.generate();
    const expiresAt = new Date(Date.now() + ttlMs);

    await this.prisma.$transaction(async (tx) => {
      await tx.oneTimeToken.updateMany({
        where: { userId, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      await tx.oneTimeToken.create({
        data: {
          userId,
          purpose,
          tokenHash: this.tokens.hash(token),
          expiresAt,
          requestIpPrefix: ipPrefix,
        },
      });
    });

    return { token, expiresAt };
  }

  /**
   * Redeems a token exactly once.
   *
   * The consumption is an atomic conditional UPDATE for the same reason refresh
   * rotation is: a read-then-write lets two simultaneous submissions of the same
   * link both succeed, which for a password reset means two parties setting a
   * password.
   *
   * Accepts an optional transaction so the caller can make redemption and the
   * action it authorises succeed or fail together.
   */
  async redeem(
    rawToken: string,
    purpose: OneTimeTokenPurpose,
    tx?: PrismaTransactionClient,
  ): Promise<RedemptionResult> {
    const client: PrismaTransactionClient | PrismaClient = tx ?? this.prisma;
    const tokenHash = this.tokens.hash(rawToken);

    const record = await client.oneTimeToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, purpose: true, expiresAt: true, consumedAt: true },
    });

    // A token issued for verification must not reset a password, so the purpose
    // is part of the match rather than something the caller assumes.
    if (record?.purpose !== purpose) return { ok: false, reason: 'unknown' };
    if (record.consumedAt !== null) return { ok: false, reason: 'consumed' };
    if (record.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };

    const claim = await client.oneTimeToken.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (claim.count === 0) return { ok: false, reason: 'consumed' };

    return { ok: true, userId: record.userId };
  }

  /**
   * How many live tokens of a purpose a user has been issued recently.
   *
   * Used to throttle resends per account, which per-IP limits cannot do: an
   * attacker flooding one victim's inbox simply rotates addresses.
   */
  async countRecent(
    userId: string,
    purpose: OneTimeTokenPurpose,
    withinMs: number,
  ): Promise<number> {
    return this.prisma.oneTimeToken.count({
      where: { userId, purpose, createdAt: { gte: new Date(Date.now() - withinMs) } },
    });
  }

  /**
   * Deletes expired and consumed tokens.
   *
   * Called by a scheduled sweep once the jobs milestone lands. Kept here rather
   * than as a raw query at the call site so the retention rule lives with the
   * table it governs.
   */
  async purgeExpired(olderThan: Date): Promise<number> {
    const result = await this.prisma.oneTimeToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: olderThan } }, { consumedAt: { lt: olderThan } }],
      },
    });

    return result.count;
  }
}
