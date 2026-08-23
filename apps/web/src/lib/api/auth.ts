import type { PermissionKey } from '@afghan-it-academy/shared/authorization';
import type { Locale } from '@afghan-it-academy/shared/i18n';

import { apiFetch } from './client';

/**
 * Typed wrappers over the authentication endpoints.
 *
 * Mirrors `docs/api/conventions.md`. Response shapes are declared here rather
 * than shared with the API package because the web app must depend on the
 * *contract*, not on the server's internal types — importing those would let a
 * refactor inside a Nest service silently change what the client believes.
 */

export type AccountStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface CurrentUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: AccountStatus;
  readonly emailVerified: boolean;
  readonly preferredLocale: Locale;
  readonly roles: readonly string[];
  /** Used only to decide what to render. Every real check happens server-side. */
  readonly permissions: readonly PermissionKey[];
}

export interface SessionSummary {
  readonly id: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly expiresAt: string;
  readonly ipPrefix: string | null;
  readonly userAgent: string | null;
  readonly isCurrent: boolean;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export function register(input: {
  email: string;
  password: string;
  displayName: string;
  preferredLocale: Locale;
}): Promise<{ status: string }> {
  return post('/v1/auth/register', input);
}

export function verifyEmail(token: string): Promise<{ status: string }> {
  return post('/v1/auth/verify-email', { token });
}

export function resendVerification(email: string): Promise<{ status: string }> {
  return post('/v1/auth/resend-verification', { email });
}

export function login(input: { email: string; password: string }): Promise<{ status: string }> {
  return post('/v1/auth/login', input);
}

export function logout(): Promise<{ status: string }> {
  return post('/v1/auth/logout');
}

export function forgotPassword(email: string): Promise<{ status: string }> {
  return post('/v1/auth/forgot-password', { email });
}

export function resetPassword(input: {
  token: string;
  newPassword: string;
}): Promise<{ status: string }> {
  return post('/v1/auth/reset-password', input);
}

export function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ status: string }> {
  return post('/v1/me/password', input);
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return apiFetch<CurrentUser>('/v1/me');
}

export function fetchSessions(): Promise<SessionSummary[]> {
  return apiFetch<SessionSummary[]>('/v1/me/sessions');
}

export async function revokeSession(sessionId: string): Promise<void> {
  // 204, so there is no body to hand back — awaited rather than returned so the
  // caller still sees a rejection.
  await apiFetch<unknown>(`/v1/me/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}

export function revokeOtherSessions(): Promise<{ revoked: number }> {
  return post('/v1/me/sessions/revoke-others');
}
