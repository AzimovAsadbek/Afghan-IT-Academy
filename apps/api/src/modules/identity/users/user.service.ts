import { DEFAULT_ROLE, type Locale as DomainLocale } from '@afghan-it-academy/shared';
import { Inject, Injectable } from '@nestjs/common';

import type { UserStatus } from '../../../../generated/prisma/index.js';
import { ENV, type Env } from '../../../config/index.js';
import {
  PrismaService,
  toDomainLocale,
  toStoredLocale,
  type PrismaTransactionClient,
} from '../../../infrastructure/prisma/index.js';

/**
 * Consecutive failures before an account is locked.
 *
 * Ten is deliberately generous. Learners on shared or low-end devices mistype
 * passwords, and a tight threshold turns a security control into a support
 * burden — and into a denial-of-service lever, since anyone who knows an email
 * address can trigger it. The lock is short and self-clearing for the same
 * reason; per-IP throttling carries most of the load against automated attacks.
 */
export const MAX_FAILED_LOGINS = 10;

/** How long an account stays locked once the threshold is crossed. */
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/** The account fields the authentication path needs. Nothing more is selected. */
export interface AuthenticatableUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string | null;
  readonly status: UserStatus;
  readonly emailVerifiedAt: Date | null;
  readonly lockedUntil: Date | null;
  readonly failedLoginCount: number;
  readonly preferredLocale: DomainLocale;
}

/** The safe projection returned to clients. Never includes passwordHash. */
export interface PublicUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: UserStatus;
  readonly emailVerified: boolean;
  readonly preferredLocale: DomainLocale;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Lower-cases and trims an address for the unique index and for lookups.
   *
   * Applied at every boundary rather than trusting callers: a lookup that skips
   * it silently fails to find an account that registration would refuse to
   * create, which presents to the user as "my password stopped working".
   */
  static normaliseEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async findForAuthentication(email: string): Promise<AuthenticatableUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: UserService.normaliseEmail(email) },
      select: {
        id: true,
        email: true,
        displayName: true,
        passwordHash: true,
        status: true,
        emailVerifiedAt: true,
        lockedUntil: true,
        failedLoginCount: true,
        preferredLocale: true,
      },
    });

    // Translate at the persistence boundary so the rest of the domain only ever
    // sees BCP 47 tags.
    return user ? { ...user, preferredLocale: toDomainLocale(user.preferredLocale) } : null;
  }

  /**
   * Creates an account with the default role, in one transaction.
   *
   * Role assignment belongs inside the transaction: an account that exists
   * without a role cannot be authorised for anything, and would need manual
   * repair.
   */
  async createWithDefaultRole(input: {
    email: string;
    passwordHash: string;
    displayName: string;
    preferredLocale: DomainLocale;
  }): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email.trim(),
          emailNormalized: UserService.normaliseEmail(input.email),
          passwordHash: input.passwordHash,
          displayName: input.displayName,
          preferredLocale: toStoredLocale(input.preferredLocale),
          status: 'PENDING_VERIFICATION',
        },
        select: { id: true },
      });

      const role = await tx.role.findUniqueOrThrow({
        where: { key: DEFAULT_ROLE },
        select: { id: true },
      });

      await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });

      return user;
    });
  }

  /** The projection safe to serialise to a client. */
  async findPublic(userId: string): Promise<PublicUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        emailVerifiedAt: true,
        preferredLocale: true,
        roles: {
          select: {
            role: {
              select: {
                key: true,
                permissions: { select: { permission: { select: { key: true } } } },
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    const permissions = new Set<string>();
    for (const assignment of user.roles) {
      for (const grant of assignment.role.permissions) permissions.add(grant.permission.key);
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      emailVerified: user.emailVerifiedAt !== null,
      preferredLocale: toDomainLocale(user.preferredLocale),
      roles: user.roles.map((assignment) => assignment.role.key),
      permissions: [...permissions].sort(),
    };
  }

  /** Effective permissions: the union across every role the user holds. */
  async permissionsOf(userId: string): Promise<string[]> {
    const grants = await this.prisma.rolePermission.findMany({
      where: { role: { users: { some: { userId } } } },
      select: { permission: { select: { key: true } } },
      distinct: ['permissionId'],
    });

    return grants.map((grant) => grant.permission.key).sort();
  }

  /**
   * Records a failed sign-in and locks the account once the threshold is
   * crossed.
   *
   * @returns whether this failure caused a lock, so the caller can audit it.
   */
  async recordFailedLogin(userId: string): Promise<{ locked: boolean }> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });

    if (user.failedLoginCount < MAX_FAILED_LOGINS) return { locked: false };

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS),
        // Reset the counter with the lock, so the next lock needs another full
        // run of failures rather than triggering on the very next attempt.
        failedLoginCount: 0,
      },
    });

    return { locked: true };
  }

  /** Clears the failure counter and any lock, and stamps the sign-in time. */
  async recordSuccessfulLogin(userId: string, tx?: PrismaTransactionClient): Promise<void> {
    await (tx ?? this.prisma).user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  }

  /** Upgrades a digest hashed with weaker parameters, after a correct password. */
  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  /**
   * Marks the address proven and activates the account.
   *
   * Only promotes PENDING_VERIFICATION accounts: verifying an email must never
   * resurrect one an administrator suspended.
   */
  async markEmailVerified(userId: string, tx?: PrismaTransactionClient): Promise<void> {
    const client = tx ?? this.prisma;

    await client.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });

    await client.user.updateMany({
      where: { id: userId, status: 'PENDING_VERIFICATION' },
      data: { status: 'ACTIVE' },
    });
  }

  /** True while a transient brute-force lock is still in effect. */
  isLocked(user: AuthenticatableUser): boolean {
    return user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now();
  }

  /** The verification link's lifetime, so callers need not read config. */
  get verificationTtlMs(): number {
    return this.env.AUTH_EMAIL_VERIFICATION_TTL_SECONDS * 1000;
  }
}
