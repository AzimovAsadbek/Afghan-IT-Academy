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

**Upgrade trigger — now due.** Authenticated routes are dynamically rendered by
necessity. Next stamps a nonce onto the scripts of a dynamically rendered
document, so `'strict-dynamic'` works there even though it cannot work on the
static locale routes.

The auth API has landed; the authentication UI has not. **The first
authenticated route added to `apps/web` must carry a nonce-based policy**, with
the existing `'unsafe-inline'` policy left in place for the statically
pre-rendered marketing routes only. That means the CSP becomes per-route rather
than global — plan for it when the auth UI is built, not after.

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

### Authentication and authorization

Landed with the auth milestone. Rationale in
[ADR 0006](../architecture/decisions/0006-opaque-sessions-and-refresh-rotation.md)
and [ADR 0007](../architecture/decisions/0007-permission-based-authorization.md).

| Control                                                            | Where                                                       |
| ------------------------------------------------------------------ | ----------------------------------------------------------- |
| Argon2id password hashing                                          | `modules/identity/crypto/password.service.ts`               |
| Opaque server-side sessions; no signing keys                       | `modules/identity/sessions/session-store.ts`                |
| Refresh rotation, single-use, family revoked on replay             | `modules/identity/sessions/session.service.ts`              |
| Rotation claimed by conditional write, not read-then-write         | same — concurrent refresh cannot mint two pairs             |
| Only token _digests_ stored, in Redis and Postgres alike           | same, and `prisma/schema.prisma`                            |
| `httpOnly` + `Secure` + `SameSite` session cookies                 | `modules/identity/auth/auth-cookies.ts`                     |
| Refresh cookie path-scoped to the auth route                       | same                                                        |
| Authentication + permission guards global, opt-out via `@Public()` | `app.module.ts`                                             |
| Permission keys enforced, never role names                         | `common/authorization/permissions.guard.ts`                 |
| Effective permissions cached ≤60 s, invalidated on every change    | `modules/identity/authorization/permission-cache.ts`        |
| Brute-force lockout, distinct from suspension                      | `prisma/schema.prisma`, `AuthService`                       |
| Failed login does not reveal whether the account exists            | `modules/identity/auth/auth.service.ts`                     |
| Auth endpoints rate-limited well below the global default          | `modules/identity/auth/auth.controller.ts`                  |
| `passwordHash` absent from every response — asserted by test       | `test/auth.e2e-spec.ts`, `test/authorization.e2e-spec.ts`   |
| Role grants and revocations write an audit row                     | `modules/identity/authorization/role-assignment.service.ts` |

### CSRF

Cookie authentication is defended by cookie attributes and CORS rather than a
synchroniser token:

- Access cookie is `SameSite=Lax`, and every mutation is a `POST`/`DELETE` with
  a JSON body — so a cross-site form post does not carry it.
- Refresh cookie is `SameSite=Strict` **and** path-scoped: off the CSRF surface
  entirely.
- CORS is an explicit allow-list with no origin reflection, so a cross-origin
  script cannot read a response even where it can provoke a request.
- No `GET` endpoint mutates state — the one case `Lax` would not cover.

**Trigger for adding a synchroniser token:** the first state-changing `GET`, or
the first cross-site form post. Neither should be introduced casually. Reasoning
in full in ADR 0006.

### Ownership

Permissions answer "what may this kind of user do", never "does this row belong
to them". Both checks are required for an owned resource; neither substitutes
for the other.

`DELETE /me/sessions/:id` verifies ownership with `SessionService.belongsTo`
before revoking, and returns `404` — not `403` — when the session belongs to
someone else, because distinguishing the two confirms which ids are real.
`GET /me/sessions` and `revokeAllForUser` filter by `userId` in the query
itself.

**Known deviation:** the revoke path is check-then-act across two queries, while
`.claude/rules/database.md` requires filtering by owner in the query itself. It
is not exploitable here — a session's `userId` never changes, so the value
checked cannot go stale — but it is the pattern the rule exists to discourage,
and it should become an owner-scoped `updateMany` when the auth security audit
runs.

## Deferred — implement with the milestone that needs it

| Control                                                      | Milestone |
| ------------------------------------------------------------ | --------- |
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
