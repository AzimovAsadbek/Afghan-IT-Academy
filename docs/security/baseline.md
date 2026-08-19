# Security baseline

Controls that are in place today, and the ones deliberately deferred. Anything
listed as "in place" is verified by a test or was observed working at runtime.

## In place

### Transport and headers

| Control                                             | Where                                                         |
| --------------------------------------------------- | ------------------------------------------------------------- |
| Helmet (CSP, `nosniff`, `no-referrer`, COOP/CORP)   | `apps/api/src/bootstrap/configure-app.ts`                     |
| HSTS, preload, subdomains (production only)         | same                                                          |
| CSP (see the known gap below)                       | `apps/web/src/lib/csp.ts`, applied in `apps/web/src/proxy.ts` |
| `X-Frame-Options: DENY`, `frame-ancestors 'none'`   | `apps/web/next.config.ts` + Helmet                            |
| `Permissions-Policy` denying camera/mic/geo/payment | `apps/web/next.config.ts`                                     |
| Framework version not advertised                    | `poweredByHeader: false`                                      |

### Known gap: `script-src 'unsafe-inline'` on the web app

A nonce-based policy with `'strict-dynamic'` was implemented first and then
removed, because on this app it is actively broken rather than merely redundant.

Every locale route is statically pre-rendered to meet the low-bandwidth budget
(ADR 0005). Static HTML is built once, so it carries no per-request nonce — and
`'strict-dynamic'` causes `'self'` to be **ignored**. The prerendered document
contains nine external chunks and two inline bootstrap scripts, none of which
would carry a nonce; every one of them would be blocked. The page renders and
never hydrates.

This was confirmed in a browser rather than reasoned about. The failure is
invisible to a `curl` of the HTML, because static markup looks perfectly correct
without JavaScript — which is exactly why it would have shipped.

The policy therefore permits inline scripts, and keeps every directive that does
not depend on per-request state as tight as it goes: `default-src 'self'`,
`object-src 'none'`, `base-uri 'none'`, `form-action 'self'`,
`frame-ancestors 'none'`, `connect-src 'self'`, `font-src 'self'`.

Residual XSS risk is bounded by React escaping interpolated values and by
`dangerouslySetInnerHTML` being absent from the codebase. Both are review items,
not guarantees.

**Upgrade trigger:** authenticated routes are dynamically rendered by necessity.
When they land in the auth milestone, give them a nonce-based policy — Next
stamps the nonce onto the scripts of a dynamically rendered document, so
`'strict-dynamic'` works there.

### Input and output

| Control                                         | Where                                                  |
| ----------------------------------------------- | ------------------------------------------------------ |
| Zod validation at the handler boundary          | `apps/api/src/common/pipes/zod-validation.pipe.ts`     |
| Unknown keys stripped (mass-assignment defence) | same — the pipe returns parsed output, not raw input   |
| Stable error codes, no prose leaked to clients  | `packages/shared/src/errors/error-codes.ts`            |
| Internal errors never leak message/stack/SQL    | `apps/api/src/common/filters/all-exceptions.filter.ts` |
| Parameterised queries only (Prisma)             | `apps/api/src/infrastructure/prisma`                   |

Exactly one validation library is registered. Nest's class-validator
`ValidationPipe` is deliberately **not** installed: two validation systems
eventually disagree about what a valid payload is.

### Environment and secrets

| Control                                                            | Where                               |
| ------------------------------------------------------------------ | ----------------------------------- |
| Environment validated at boot; process refuses to start otherwise  | `apps/api/src/config/env.schema.ts` |
| No defaults for secrets, ever                                      | same                                |
| Plain-HTTP CORS origins rejected in production                     | same                                |
| `debug`/`trace` logging rejected in production                     | same                                |
| `process.env` access confined to `config/` by lint rule            | `packages/eslint-config/nest.js`    |
| `.env*` git-ignored; `.env.example` is the only committed template | `.gitignore`                        |
| Secret-scanning hook blocks reads/writes of env and key files      | `.claude/hooks/protect-secrets.sh`  |
| gitleaks runs in CI on every push and PR                           | `.github/workflows/ci.yml`          |

### Abuse and correlation

| Control                                                 | Where                                                     |
| ------------------------------------------------------- | --------------------------------------------------------- |
| Redis-backed rate limiting, applied globally            | `apps/api/src/app.module.ts`                              |
| Explicit CORS allow-list; no origin reflection          | `configure-app.ts`                                        |
| Request body size capped (1 MB default)                 | same                                                      |
| `trust proxy` hop count explicit, defaults to 0         | same                                                      |
| Request-id validated before it is echoed or logged      | `apps/api/src/common/middleware/request-id.middleware.ts` |
| Credentials, tokens and passwords redacted from logs    | `apps/api/src/common/logging/logger.config.ts`            |
| Audit log survives deletion of the account it describes | `apps/api/prisma/schema.prisma`                           |

Rate limiting is Redis-backed rather than in-memory specifically so the limit
holds across replicas — an in-memory store lets an attacker multiply their quota
by the number of instances simply by reconnecting.

The request-id is validated because it is echoed into log lines and response
bodies. An unbounded or control-character-laden value would allow log injection
and forgery of adjacent records. Verified by e2e test.

Audit-log IP addresses are truncated to a /24 (IPv4) or /48 (IPv6) prefix before
storage: enough to investigate abuse, not enough to track an individual learner.

## Deferred — implement with the milestone that needs it

| Control                                                      | Milestone |
| ------------------------------------------------------------ | --------- |
| Argon2id password hashing                                    | auth      |
| Refresh-token rotation with reuse detection                  | auth      |
| RBAC + permission checks, server-side only                   | auth      |
| CSRF defence for cookie-authenticated mutations              | auth      |
| IDOR-safe resource ownership checks                          | auth      |
| File upload validation, signed URLs, out-of-process scanning | learning  |
| SSRF allow-list for outbound fetches                         | ai        |
| AI prompt-injection boundaries and cost caps                 | ai        |
| Payment security review                                      | commerce  |

`passwordHash` exists on `User` but is never selected into a DTO. When auth
lands, that guarantee must become a test.

## Review checklist

Before merging anything that touches auth, data access or user input:

- [ ] Authorization checked on the server, for every resource, by owner
- [ ] Input validated with a Zod schema; unknown keys rejected
- [ ] No secret in code, logs, error message or client bundle
- [ ] No `NEXT_PUBLIC_` variable holding anything sensitive
- [ ] Query is parameterised
- [ ] Security-relevant action writes an audit entry
- [ ] Error path leaks no internal detail
- [ ] New endpoint is rate-limited (global guard covers it unless opted out)
