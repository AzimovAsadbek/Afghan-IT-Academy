import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';

import { routing } from './i18n/routing';
import { buildContentSecurityPolicy } from './lib/csp';

const intlProxy = createMiddleware(routing);

const CONTENT_SECURITY_POLICY = buildContentSecurityPolicy(process.env.NODE_ENV === 'development');

/**
 * Runs before every document request: applies locale routing and the security
 * policy. Policy construction lives in lib/csp.ts so it can be unit-tested.
 *
 * The original `request` object is passed straight through to next-intl.
 * Wrapping it in a plain `Request` strips `nextUrl`, which is what next-intl
 * uses to decide the locale redirect — and the failure is quiet: locale pages
 * still resolve, but `/` stops redirecting and returns 404.
 */
export default function proxy(request: NextRequest) {
  const response = intlProxy(request);
  response.headers.set('content-security-policy', CONTENT_SECURITY_POLICY);
  return response;
}

export const config = {
  /* Skip the static asset pipeline and API routes: they need neither a locale
   * nor a document CSP, and running this on every chunk request would add
   * latency to exactly the payloads that matter most on a slow connection.
   * The final alternative excludes any path containing a dot, i.e. files. */
  matcher: ['/((?!api|_next/static|_next/image|.*\\..*).*)'],
};
