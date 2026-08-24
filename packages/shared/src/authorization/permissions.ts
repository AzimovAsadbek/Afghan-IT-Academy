/**
 * The permission catalogue.
 *
 * Authorization is always evaluated against one of these keys, never against a
 * role name. `if (user.role === 'ADMIN')` is exactly the pattern this exists to
 * prevent: it cannot express "this one support agent may issue refunds", and it
 * turns every new capability into a scattered edit.
 *
 * Keys are **permanent contract**. They are stored in the database, referenced
 * by seeded role grants, and may be checked by the web app to decide whether to
 * render a control. Renaming one silently removes an administrator's capability.
 *
 * Shared between API and web deliberately, but note the asymmetry: the web uses
 * these only to decide what to *show*. Every decision that matters is enforced
 * again on the server, because a hidden button is not a security control.
 */
export const PERMISSIONS = {
  /* --- Catalogue and content ---------------------------------------------- */
  COURSE_VIEW_UNPUBLISHED: 'course:view_unpublished',
  COURSE_CREATE: 'course:create',
  COURSE_UPDATE: 'course:update',
  COURSE_PUBLISH: 'course:publish',
  COURSE_DELETE: 'course:delete',

  /* --- Learners ----------------------------------------------------------- */
  STUDENT_VIEW: 'student:view',
  STUDENT_SUSPEND: 'student:suspend',

  /* --- Accounts and access ------------------------------------------------ */
  USER_VIEW: 'user:view',
  USER_UPDATE: 'user:update',
  USER_ASSIGN_ROLE: 'user:assign_role',
  ROLE_MANAGE: 'role:manage',

  /* --- Commerce ----------------------------------------------------------- */
  PAYMENT_VIEW: 'payment:view',
  PAYMENT_REFUND: 'payment:refund',

  /* --- Certification ------------------------------------------------------ */
  CERTIFICATE_ISSUE: 'certificate:issue',
  CERTIFICATE_REVOKE: 'certificate:revoke',

  /* --- Oversight ---------------------------------------------------------- */
  AUDIT_VIEW: 'audit:view',
  ANALYTICS_VIEW: 'analytics:view',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Every permission key, for seeding and for exhaustiveness checks. */
export const ALL_PERMISSIONS: readonly PermissionKey[] = Object.values(PERMISSIONS);

/**
 * Role keys.
 *
 * A role is a named bundle of permissions and nothing more. Adding a role never
 * requires a code change; adding a *permission* does, because something has to
 * enforce it.
 */
export const ROLES = {
  STUDENT: 'STUDENT',
  INSTRUCTOR: 'INSTRUCTOR',
  CONTENT_REVIEWER: 'CONTENT_REVIEWER',
  CONTENT_MANAGER: 'CONTENT_MANAGER',
  SUPPORT_AGENT: 'SUPPORT_AGENT',
  FINANCE_MANAGER: 'FINANCE_MANAGER',
  ANALYST: 'ANALYST',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: readonly RoleKey[] = Object.values(ROLES);

/** The role every account receives at registration. */
export const DEFAULT_ROLE: RoleKey = ROLES.STUDENT;

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === 'string' && (ALL_PERMISSIONS as readonly string[]).includes(value);
}

export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === 'string' && (ALL_ROLES as readonly string[]).includes(value);
}
