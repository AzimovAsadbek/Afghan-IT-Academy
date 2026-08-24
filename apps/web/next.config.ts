import { resolve } from 'node:path';

import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Headers that are safe to serve statically on every response.
 *
 * The Content-Security-Policy is deliberately NOT here: it is built in
 * `src/lib/csp.ts` and applied in `src/proxy.ts`, which is also where a
 * per-route policy would live. See the CSP section of docs/security/baseline.md
 * for why the current policy permits inline scripts.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    // Nothing in this product needs these; denying them shrinks the attack
    // surface of any third-party script that ever slips in.
    value: 'camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload',
  },
] as const;

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /* Emits a self-contained server bundle with only the modules actually used,
   * so the production image does not carry node_modules. */
  output: 'standalone',

  /* Trace from the workspace root, not from apps/web.
   *
   * In a pnpm monorepo the real packages live in the root .pnpm store and are
   * reached through symlinks. Tracing from the app directory follows those
   * links but stops short of siblings such as @swc/helpers, producing a
   * standalone bundle that builds cleanly and then dies at startup with
   * MODULE_NOT_FOUND. Builds run with the cwd set to this package, so the
   * workspace root is two levels up. */
  outputFileTracingRoot: resolve(process.cwd(), '../..'),

  /* Force the whole @swc/helpers package into the trace.
   *
   * Next's compiled output reaches the ESM half through the package's exports
   * map, which the tracer cannot follow statically — it copies only `cjs/` and
   * the server then dies on
   * `Cannot find module '.../@swc/helpers/esm/_interop_require_default.js'`.
   * Declaring the package as a dependency does not help; the tracer decides
   * what to copy, not pnpm. */
  outputFileTracingIncludes: {
    '/**': ['../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**'],
  },

  /* Do not advertise the framework version to attackers or scanners. */
  poweredByHeader: false,

  /* Trailing-slash-free canonical URLs; avoids duplicate-content redirects
   * that cost an extra round trip on a high-latency connection. */
  trailingSlash: false,

  /* --- Low bandwidth -------------------------------------------------------
   * Afghanistan-first delivery. Every setting here exists to cut bytes or
   * round trips on a 2G/3G connection.
   */
  compress: true,

  images: {
    // AVIF first: roughly 20-30% smaller than WebP at equivalent quality.
    formats: ['image/avif', 'image/webp'],
    // Tuned to real low-end device widths rather than Next's desktop-heavy
    // defaults, so phones never download a 1920px asset.
    deviceSizes: [320, 420, 640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    // Long cache: images are content-addressed by the optimizer.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    dangerouslyAllowSVG: false,
  },

  experimental: {
    // Import only the icons/components actually used instead of whole barrels.
    optimizePackageImports: ['@afghan-it-academy/ui'],
  },

  /* Shared workspace packages ship TypeScript-adjacent output; Next must
   * transpile them rather than assume pre-built browser bundles. */
  transpilePackages: ['@afghan-it-academy/ui'],

  /* A type error must fail the build, never be skipped. (Next 16 removed the
   * built-in ESLint step; linting is its own Turborepo task and CI gate.) */
  typescript: { ignoreBuildErrors: false },

  // Typed as returning a Promise by Next, though nothing here is async.
  headers: () => Promise.resolve([{ source: '/:path*', headers: [...securityHeaders] }]),
};

export default withNextIntl(nextConfig);
