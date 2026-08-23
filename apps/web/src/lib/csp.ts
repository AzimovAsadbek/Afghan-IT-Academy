/**
 * Content-Security-Policy construction.
 *
 * Extracted from the proxy so the policy can be unit-tested. A CSP that is
 * silently wrong is worse than no CSP, because it creates the belief that XSS
 * is mitigated when it is not — and a CSP that is silently *too strict* breaks
 * hydration in a way that static HTML hides from a casual check.
 *
 * ## Why there is no nonce
 *
 * Every locale route is statically pre-rendered (`● SSG`) to meet the
 * low-bandwidth budget in ADR 0005. Static HTML is built once, so it cannot
 * carry a per-request nonce.
 *
 * A nonce-based policy on this app is not merely useless, it is broken:
 * `'strict-dynamic'` causes `'self'` to be *ignored*, so the nine external
 * chunks and two inline bootstrap scripts in the prerendered document would all
 * be blocked. The page would render and never hydrate.
 *
 * The policy below therefore permits inline scripts, and compensates by keeping
 * every directive that does not depend on per-request state as tight as it goes.
 * The residual XSS risk is bounded by React escaping interpolated values and by
 * `dangerouslySetInnerHTML` being absent from the codebase.
 *
 * **Upgrade trigger:** a route that is *dynamically* rendered can carry a
 * nonce, because Next stamps it onto that document's scripts. The authenticated
 * routes added in the auth milestone are deliberately still static shells that
 * fetch on the client, so the trigger has not fired. The first genuinely
 * dynamic route is the one to revisit this on. See docs/security/baseline.md.
 */

/**
 * The API origin the browser is allowed to call.
 *
 * `connect-src 'self'` alone is wrong the moment the API is on its own origin —
 * which it is in every environment, including local development, where the web
 * app runs on :3000 and the API on :4000. The symptom is a blocked `fetch` that
 * surfaces to the user as "we could not reach the server", with the real reason
 * visible only in the browser console.
 *
 * Only the origin is taken. A path in `connect-src` is ignored by the browser,
 * and including one invites the belief that the policy is narrower than it is.
 */
function apiOriginOf(apiUrl: string | undefined): string | null {
  if (apiUrl === undefined || apiUrl === '') return null;

  try {
    return new URL(apiUrl).origin;
  } catch {
    // A relative value means the API is same-origin; 'self' already covers it.
    return null;
  }
}

export function buildContentSecurityPolicy(isDevelopment: boolean, apiUrl?: string): string {
  const scriptSrc = [
    "script-src 'self'",
    // Next's prerendered documents contain unhashable inline bootstrap scripts.
    // See the note above: with static rendering there is no stricter option that
    // still hydrates.
    "'unsafe-inline'",
    // Required only by the dev-mode React refresh runtime.
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ].join(' ');

  const apiOrigin = apiOriginOf(apiUrl);

  const connectSrc = [
    "connect-src 'self'",
    ...(apiOrigin === null ? [] : [apiOrigin]),
    // The dev server's hot-reload socket. Never present in production.
    ...(isDevelopment ? ['ws:'] : []),
  ].join(' ');

  return [
    "default-src 'self'",
    scriptSrc,
    // Next injects inline <style> for critical CSS.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    // Fonts are self-hosted by next/font; no third-party host is permitted.
    "font-src 'self' data:",
    connectSrc,
    "media-src 'self' blob:",
    // Blocks <object>/<embed> plugin-based script execution entirely.
    "object-src 'none'",
    // Prevents an injected <base> tag from re-pointing every relative URL.
    "base-uri 'none'",
    // An injected form cannot exfiltrate to an attacker-controlled endpoint.
    "form-action 'self'",
    // Clickjacking defence; pairs with X-Frame-Options: DENY.
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    // Omitted in development: it would rewrite the plain-http dev API origin,
    // and there is no mixed-content risk on localhost.
    ...(isDevelopment ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}
