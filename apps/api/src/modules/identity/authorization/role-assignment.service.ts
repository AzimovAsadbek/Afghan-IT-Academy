import { type RoleKey } from '@afghan-it-academy/shared';
import { Injectable } from '@nestjs/common';

import type { ClientContext } from '../../../common/index.js';
import { PrismaService } from '../../../infrastructure/prisma/index.js';
import { AuditService } from '../../audit/index.js';
import { AUTH_ACTIONS } from '../auth-actions.js';
import { PermissionCache } from './permission-cache.js';

export type RoleChangeFailure = 'unknown_user' | 'unknown_role';

export type RoleChangeResult =
  | { readonly ok: true; readonly changed: boolean }
  | { readonly ok: false; readonly reason: RoleChangeFailure };

/**
 * Granting and revoking roles.
 *
 * Every change here is audited *inside the transaction* that makes it. A role
 * grant that succeeded without leaving a record is worse than one that failed:
 * the privilege exists and nothing says who gave it or when.
 *
 * The permission cache is invalidated immediately afterwards rather than being
 * left to expire, so a revocation takes effect on the next request instead of
 * up to a minute later.
 */
@Injectable()
export class RoleAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: PermissionCache,
  ) {}

  async grant(
    userId: string,
    roleKey: RoleKey,
    grantedBy: string,
    context: ClientContext,
  ): Promise<RoleChangeResult> {
    const [user, role] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
      this.prisma.role.findUnique({ where: { key: roleKey }, select: { id: true } }),
    ]);

    if (!user) return { ok: false, reason: 'unknown_user' };
    if (!role) return { ok: false, reason: 'unknown_role' };

    const changed = await this.prisma.$transaction(async (tx) => {
      const created = await tx.userRole.createMany({
        data: [{ userId, roleId: role.id, assignedById: grantedBy }],
        // Re-granting a role someone already holds is a no-op, not an error:
        // the caller's intent is satisfied either way.
        skipDuplicates: true,
      });

      if (created.count === 0) return false;

      await this.audit.recordInTransaction(
        tx,
        {
          action: AUTH_ACTIONS.ROLE_GRANTED,
          actorId: grantedBy,
          entityType: 'User',
          entityId: userId,
          metadata: { role: roleKey },
        },
        context,
      );

      return true;
    });

    if (changed) await this.cache.invalidate(userId);

    return { ok: true, changed };
  }

  async revoke(
    userId: string,
    roleKey: RoleKey,
    revokedBy: string,
    context: ClientContext,
  ): Promise<RoleChangeResult> {
    const role = await this.prisma.role.findUnique({
      where: { key: roleKey },
      select: { id: true },
    });

    if (!role) return { ok: false, reason: 'unknown_role' };

    const changed = await this.prisma.$transaction(async (tx) => {
      const removed = await tx.userRole.deleteMany({ where: { userId, roleId: role.id } });

      if (removed.count === 0) return false;

      await this.audit.recordInTransaction(
        tx,
        {
          action: AUTH_ACTIONS.ROLE_REVOKED,
          actorId: revokedBy,
          entityType: 'User',
          entityId: userId,
          metadata: { role: roleKey },
        },
        context,
      );

      return true;
    });

    // Invalidated even when nothing changed: cheap, and the alternative is a
    // revocation that appears to succeed while the old permissions persist.
    await this.cache.invalidate(userId);

    return { ok: true, changed };
  }
}
