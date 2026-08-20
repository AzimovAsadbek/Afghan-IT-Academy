import type { CookieOptions, Request, Response } from 'express';

import type { Env } from '../../../config/index.js';
import type { IssuedSession } from '../sessions/index.js';

export const ACCESS_COOKIE = 'aia_at';
export const REFRESH_COOKIE = 'aia_rt';

/**
 * Cookie transport for session credentials.
 *
 * `httpOnly` is the point: an access token in `localStorage` is readable by any
 * script that manages to run on the page, which turns every XSS into a full
 * account takeover. A cookie the document cannot read does not.
 *
 * The refresh cookie is deliberately scoped to the auth path. It is the
 * longer-lived, higher-value credential, so it should not accompany every
 * request for a course listing — narrowing `Path` removes it from the vast
 * majority of traffic, including anything a future proxy or log might capture.
 */
function baseOptions(env: Env): CookieOptions {
  return {
    httpOnly: true,
    // Secure is dropped only outside production, because http://localhost
    // would otherwise silently discard the cookie and every local login would
    // appear to succeed and then fail.
    secure: env.NODE_ENV === 'production',
    // Lax, not Strict, for the access cookie: Strict would omit the cookie when
    // a user arrives by following a link from their email client, presenting a
    // signed-in user with a signed-out page.
    sameSite: 'lax',
    ...(env.AUTH_COOKIE_DOMAIN ? { domain: env.AUTH_COOKIE_DOMAIN } : {}),
  };
}

export function setSessionCookies(response: Response, session: IssuedSession, env: Env): void {
  response.cookie(ACCESS_COOKIE, session.accessToken, {
    ...baseOptions(env),
    path: '/',
    expires: session.accessTokenExpiresAt,
  });

  response.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...baseOptions(env),
    // Strict for the refresh token: it is only ever presented by our own
    // JavaScript calling the refresh endpoint, never by a cross-site
    // navigation, so the stricter setting costs nothing and removes the cookie
    // from the CSRF surface entirely.
    sameSite: 'strict',
    path: `${env.API_PREFIX}/v1/auth`,
    expires: session.refreshTokenExpiresAt,
  });
}

/**
 * Clears both cookies.
 *
 * The attributes must match those used when setting them — a browser will not
 * clear a cookie whose Path or Domain differs, and the stale cookie then keeps
 * being sent after logout.
 */
export function clearSessionCookies(response: Response, env: Env): void {
  const options = baseOptions(env);

  response.clearCookie(ACCESS_COOKIE, { ...options, path: '/' });
  response.clearCookie(REFRESH_COOKIE, {
    ...options,
    sameSite: 'strict',
    path: `${env.API_PREFIX}/v1/auth`,
  });
}

/**
 * Reads the access token.
 *
 * Falls back to a bearer header so a future Flutter client — which has no
 * cookie jar worth the name — uses the same tokens and the same endpoints. The
 * cookie takes precedence, so a browser cannot be tricked into authenticating
 * with a header an attacker controls.
 */
export function readAccessToken(request: Request): string | null {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const fromCookie = cookies?.[ACCESS_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) return fromCookie;

  const header = request.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token.length > 0) return token;
  }

  return null;
}

export function readRefreshToken(request: Request): string | null {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const fromCookie = cookies?.[REFRESH_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) return fromCookie;

  const body = request.body as Record<string, unknown> | undefined;
  const fromBody = body?.refreshToken;

  return typeof fromBody === 'string' && fromBody.length > 0 ? fromBody : null;
}
