/**
 * Audit action tokens for the identity domain.
 *
 * Convention is `domain.entity.verb`. These are written into `audit_logs.action`
 * and queried by support and security tooling, so they are contract: renaming
 * one orphans every historical row that used the old name.
 *
 * Failures are recorded as deliberately as successes. "No audit rows" and "no
 * attacks" look identical otherwise.
 */
export const AUTH_ACTIONS = {
  /* --- Registration and verification -------------------------------------- */
  REGISTERED: 'auth.account.registered',
  /** A registration attempt for an address that already has an account. */
  REGISTER_DUPLICATE: 'auth.account.register_duplicate',
  EMAIL_VERIFIED: 'auth.email.verified',
  VERIFICATION_SENT: 'auth.email.verification_sent',
  VERIFICATION_FAILED: 'auth.email.verification_failed',

  /* --- Sign in ------------------------------------------------------------ */
  LOGIN_SUCCEEDED: 'auth.login.succeeded',
  LOGIN_FAILED: 'auth.login.failed',
  /** Refused before the password was even checked: suspended, deactivated. */
  LOGIN_BLOCKED: 'auth.login.blocked',
  ACCOUNT_LOCKED: 'auth.account.locked',
  LOGOUT: 'auth.session.logout',

  /* --- Sessions ----------------------------------------------------------- */
  SESSION_REVOKED: 'auth.session.revoked',
  SESSIONS_REVOKED_ALL: 'auth.session.revoked_all',
  REFRESH_ROTATED: 'auth.refresh.rotated',
  /** A refresh token was presented twice. See SessionService.refresh. */
  REFRESH_REUSE_DETECTED: 'auth.refresh.reuse_detected',

  /* --- Credentials -------------------------------------------------------- */
  PASSWORD_CHANGED: 'auth.password.changed',
  PASSWORD_RESET_REQUESTED: 'auth.password.reset_requested',
  PASSWORD_RESET_COMPLETED: 'auth.password.reset_completed',
  PASSWORD_RESET_FAILED: 'auth.password.reset_failed',

  /* --- Authorization ------------------------------------------------------ */
  ROLE_GRANTED: 'auth.role.granted',
  ROLE_REVOKED: 'auth.role.revoked',
  /** An authenticated user was refused for lacking a permission. */
  PERMISSION_DENIED: 'auth.permission.denied',
} as const;

export type AuthAction = (typeof AUTH_ACTIONS)[keyof typeof AUTH_ACTIONS];
