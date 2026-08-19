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
 * **Upgrade trigger:** authenticated routes are dynamically rendered by
 * necessity. When they land in the auth milestone, give them a nonce-based
 * policy — at that point `'strict-dynamic'` works, because Next stamps the nonce
 * onto the scripts of a dynamically rendered document.
 */

export function buildContentSecurityPolicy(isDevelopment: boolean): string {
  const scriptSrc = [
    "script-src 'self'",
    // Next's prerendered documents contain unhashable inline bootstrap scripts.
    // See the note above: with static rendering there is no stricter option that
    // still hydrates.
    "'unsafe-inline'",
    // Required only by the dev-mode React refresh runtime.
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ].join(' ');

  return [
    "default-src 'self'",
    scriptSrc,
    // Next injects inline <style> for critical CSS.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    // Fonts are self-hosted by next/font; no third-party host is permitted.
    "font-src 'self' data:",
    "connect-src 'self'",
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
    'upgrade-insecure-requests',
  ].join('; ');
}
