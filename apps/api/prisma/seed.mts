import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLES,
  type PermissionKey,
  type RoleKey,
} from '@afghan-it-academy/shared';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/index.js';

/**
 * Loads the repository-root .env, the same file docker-compose reads.
 *
 * Duplicated from prisma.config.ts rather than shared: that file is loaded by
 * the Prisma CLI as CommonJS-compatible TypeScript, this one runs as an ES
 * module under Node's type stripping, and a shared helper would have to satisfy
 * both module systems to save ten lines.
 */
function loadRootEnv(): void {
  let current = process.cwd();
  for (;;) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) {
      const envFile = resolve(current, '.env');
      if (existsSync(envFile)) process.loadEnvFile(envFile);
      return;
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

loadRootEnv();

/**
 * Seeds the authorization catalogue.
 *
 * Idempotent and *convergent*: it does not merely add missing rows, it makes the
 * database match this file. Removing a grant here removes it from the database
 * on the next run, so the mapping below is the single source of truth rather
 * than a historical accumulation of whatever anyone ever granted.
 *
 * Deliberately does NOT create any user. A seeded administrator is a shipped
 * backdoor with a known email; bootstrapping the first SUPER_ADMIN is an
 * explicit operational step, documented in docs/security/.
 *
 * Run with `pnpm db:seed`. Node 24 strips the types natively, so this needs no
 * extra toolchain.
 */

const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  [PERMISSIONS.COURSE_VIEW_UNPUBLISHED]: 'View courses that are not yet published',
  [PERMISSIONS.COURSE_CREATE]: 'Create a course',
  [PERMISSIONS.COURSE_UPDATE]: 'Edit course content and metadata',
  [PERMISSIONS.COURSE_PUBLISH]: 'Publish or unpublish a course',
  [PERMISSIONS.COURSE_DELETE]: 'Delete a course',
  [PERMISSIONS.STUDENT_VIEW]: 'View learner profiles and progress',
  [PERMISSIONS.STUDENT_SUSPEND]: 'Suspend a learner account',
  [PERMISSIONS.USER_VIEW]: 'View any account',
  [PERMISSIONS.USER_UPDATE]: 'Edit account details',
  [PERMISSIONS.USER_ASSIGN_ROLE]: 'Grant or revoke a role',
  [PERMISSIONS.ROLE_MANAGE]: 'Create and modify roles and their permissions',
  [PERMISSIONS.PAYMENT_VIEW]: 'View payments and invoices',
  [PERMISSIONS.PAYMENT_REFUND]: 'Issue a refund',
  [PERMISSIONS.CERTIFICATE_ISSUE]: 'Issue a certificate',
  [PERMISSIONS.CERTIFICATE_REVOKE]: 'Revoke an issued certificate',
  [PERMISSIONS.AUDIT_VIEW]: 'Read the audit log',
  [PERMISSIONS.ANALYTICS_VIEW]: 'View platform analytics',
};

const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  [ROLES.STUDENT]: 'Learner. Needs no elevated permission for their own study.',
  [ROLES.INSTRUCTOR]: 'Authors and teaches courses, and sees their own learners.',
  [ROLES.CONTENT_REVIEWER]: 'Reviews course material before publication.',
  [ROLES.CONTENT_MANAGER]: 'Owns the catalogue, including publication.',
  [ROLES.SUPPORT_AGENT]: 'Helps learners; can see accounts and suspend abusive ones.',
  [ROLES.FINANCE_MANAGER]: 'Handles payments and refunds.',
  [ROLES.ANALYST]: 'Reads analytics. No access to individual learner records.',
  [ROLES.ADMIN]: 'Platform administration, excluding role management itself.',
  [ROLES.SUPER_ADMIN]: 'Unrestricted. Grants and revokes roles.',
};

/**
 * The role → permission mapping.
 *
 * STUDENT holds none on purpose: acting on your own account is authorised by
 * ownership, not by a permission. Granting `student:view` to STUDENT would let
 * every learner read every other learner.
 */
const ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]> = {
  [ROLES.STUDENT]: [],

  [ROLES.INSTRUCTOR]: [
    PERMISSIONS.COURSE_CREATE,
    PERMISSIONS.COURSE_UPDATE,
    PERMISSIONS.COURSE_VIEW_UNPUBLISHED,
    PERMISSIONS.STUDENT_VIEW,
  ],

  [ROLES.CONTENT_REVIEWER]: [PERMISSIONS.COURSE_VIEW_UNPUBLISHED, PERMISSIONS.COURSE_UPDATE],

  [ROLES.CONTENT_MANAGER]: [
    PERMISSIONS.COURSE_VIEW_UNPUBLISHED,
    PERMISSIONS.COURSE_CREATE,
    PERMISSIONS.COURSE_UPDATE,
    PERMISSIONS.COURSE_PUBLISH,
    PERMISSIONS.COURSE_DELETE,
    PERMISSIONS.CERTIFICATE_ISSUE,
  ],

  [ROLES.SUPPORT_AGENT]: [
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.STUDENT_VIEW,
    PERMISSIONS.STUDENT_SUSPEND,
  ],

  // Deliberately no STUDENT_VIEW: finance needs the payment record, not the
  // learner's study history.
  [ROLES.FINANCE_MANAGER]: [PERMISSIONS.PAYMENT_VIEW, PERMISSIONS.PAYMENT_REFUND],

  [ROLES.ANALYST]: [PERMISSIONS.ANALYTICS_VIEW],

  [ROLES.ADMIN]: [
    PERMISSIONS.COURSE_VIEW_UNPUBLISHED,
    PERMISSIONS.COURSE_CREATE,
    PERMISSIONS.COURSE_UPDATE,
    PERMISSIONS.COURSE_PUBLISH,
    PERMISSIONS.COURSE_DELETE,
    PERMISSIONS.STUDENT_VIEW,
    PERMISSIONS.STUDENT_SUSPEND,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.PAYMENT_VIEW,
    PERMISSIONS.CERTIFICATE_ISSUE,
    PERMISSIONS.CERTIFICATE_REVOKE,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.ANALYTICS_VIEW,
  ],

  // The only role that can change who holds which role.
  [ROLES.SUPER_ADMIN]: ALL_PERMISSIONS,
};

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env at the repository root.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    await prisma.$transaction(async (tx) => {
      for (const key of ALL_PERMISSIONS) {
        const description = PERMISSION_DESCRIPTIONS[key];
        await tx.permission.upsert({
          where: { key },
          update: { description },
          create: { key, description },
        });
      }

      for (const [roleKey, permissionKeys] of Object.entries(ROLE_PERMISSIONS) as [
        RoleKey,
        readonly PermissionKey[],
      ][]) {
        const role = await tx.role.upsert({
          where: { key: roleKey },
          update: { description: ROLE_DESCRIPTIONS[roleKey], isSystem: true },
          create: { key: roleKey, description: ROLE_DESCRIPTIONS[roleKey], isSystem: true },
        });

        const permissions = await tx.permission.findMany({
          where: { key: { in: [...permissionKeys] } },
          select: { id: true },
        });

        // Converge rather than accumulate: drop grants this file no longer
        // makes, so revoking a capability is a one-line edit that actually
        // takes effect.
        await tx.rolePermission.deleteMany({
          where: { roleId: role.id, permissionId: { notIn: permissions.map((p) => p.id) } },
        });

        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: role.id,
            permissionId: permission.id,
          })),
          skipDuplicates: true,
        });
      }
    });

    const [roleCount, permissionCount, grantCount] = await Promise.all([
      prisma.role.count(),
      prisma.permission.count(),
      prisma.rolePermission.count(),
    ]);

    console.warn(
      `Seed complete: ${String(roleCount)} roles, ${String(permissionCount)} permissions, ${String(grantCount)} grants.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
