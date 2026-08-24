/**
 * Where the browser sends API requests.
 *
 * One module, because two consumers must agree: the fetch client, and the CSP
 * builder that decides which origin `connect-src` permits. When those disagree
 * the browser blocks every call and the user is told "we could not reach the
 * server" — the real reason visible only in the console. That is exactly the
 * failure this file exists to prevent; it happened once during development.
 *
 * Public by necessity — the browser has to know the address — and safe, because
 * an address is not a credential.
 */

/**
 * Missing in a production build is a hard failure, deliberately. An empty base
 * resolves every call against the web origin, 404s, and looks like a network
 * fault rather than the misconfiguration it is.
 *
 * Development falls back to the port `pnpm dev` starts the API on.
 *
 * The fallback is not redundant with `.env.example`, which does define
 * `NEXT_PUBLIC_API_URL`: that template is copied to the **repository root**
 * `.env`, which the API reads, while Next only loads `.env` files from its own
 * project directory (`apps/web`). So the variable is correctly configured for
 * the API and simply invisible to `next dev` unless it is also placed in
 * `apps/web/.env.local` or exported into the environment. Without this
 * fallback every local sign-in fails with a misleading connection error.
 */
function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured !== undefined && configured !== '') return configured;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_API_URL is not set. The client cannot reach the API without it.');
  }

  return 'http://localhost:4000/api';
}

export const API_BASE_URL = resolveApiBaseUrl();
