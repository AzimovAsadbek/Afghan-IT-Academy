# API conventions

Base URL: `{origin}{API_PREFIX}` — `/api` by default.

## Versioning

URI versioning, default `v1`: `/api/v1/courses`.

Health probes are **version-neutral** and live at `/api/health/*`. Probe URLs
are configured in Kubernetes manifests and load balancers, so they must not move
when the API ships a v2.

## Health endpoints

| Endpoint                | Checks dependencies | Purpose                              |
| ----------------------- | ------------------- | ------------------------------------ |
| `GET /api/health/live`  | No                  | Is the process wedged?               |
| `GET /api/health/ready` | Yes                 | Should this replica receive traffic? |

Liveness deliberately does not touch the database. If it did, a database outage
would make every replica get killed and restarted, turning a recoverable
incident into an outage.

`ready` returns `503` with `status: "degraded"` when a dependency is down.
Neither endpoint reveals versions, hostnames or error detail — they are
unauthenticated, and an attacker should learn nothing from them.

```json
{
  "status": "ready",
  "checks": { "database": { "status": "up" }, "cache": { "status": "up" } }
}
```

## Error contract

Every non-2xx response uses one envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed.",
    "fields": [{ "path": "email", "rule": "invalid_email" }],
    "requestId": "0f2c1a3e-...",
    "timestamp": "2026-08-20T09:15:00.000Z"
  }
}
```

- `code` comes from `ERROR_CODES` in `@afghan-it-academy/shared` and is
  **permanent contract**. Renaming one breaks every translated string and every
  mobile client already in the field.
- `message` is for developers and logs. It is never rendered to an end user.
- `fields` appears only for `VALIDATION_FAILED`. `rule` is a machine token
  (`too_small`, `invalid_email`) that the client translates.
- `requestId` correlates the response with server logs.

The API returns no user-facing prose. That is what lets one API serve Dari,
Pashto and English without a redeploy to fix a translation.

## Authentication

Opaque session credentials in `httpOnly` cookies, resolved server-side. Design
rationale is in [ADR 0006](../architecture/decisions/0006-opaque-sessions-and-refresh-rotation.md).

| Cookie   | Contents      | SameSite | Path                   |
| -------- | ------------- | -------- | ---------------------- |
| `aia_at` | access token  | `Lax`    | `/`                    |
| `aia_rt` | refresh token | `Strict` | `{API_PREFIX}/v1/auth` |

Non-browser clients may present `Authorization: Bearer <access token>` instead.
When both are present the cookie wins, so a browser cannot be tricked into
authenticating with an attacker-supplied header.

**Every endpoint requires authentication unless it is explicitly `@Public()`.**
Endpoints that additionally require a capability declare it with
`@RequirePermissions(...)` — see
[ADR 0007](../architecture/decisions/0007-permission-based-authorization.md).

### Endpoints

| Method   | Path                                      | Auth       | Notes                                      |
| -------- | ----------------------------------------- | ---------- | ------------------------------------------ |
| `POST`   | `/api/v1/auth/register`                   | public     | `202`, body identical whether or not known |
| `POST`   | `/api/v1/auth/verify-email`               | public     |                                            |
| `POST`   | `/api/v1/auth/resend-verification`        | public     | `202`, uniform body                        |
| `POST`   | `/api/v1/auth/login`                      | public     | sets both cookies                          |
| `POST`   | `/api/v1/auth/refresh`                    | refresh    | rotates; replay revokes the token family   |
| `POST`   | `/api/v1/auth/logout`                     | public     | must succeed on an already-expired session |
| `POST`   | `/api/v1/auth/forgot-password`            | public     | `202`, uniform body                        |
| `POST`   | `/api/v1/auth/reset-password`             | public     | revokes every session for the account      |
| `GET`    | `/api/v1/me`                              | session    | never includes `passwordHash`              |
| `GET`    | `/api/v1/me/sessions`                     | session    | flags the current session                  |
| `DELETE` | `/api/v1/me/sessions/:sessionId`          | session    | owner-scoped in the query                  |
| `POST`   | `/api/v1/me/sessions/revoke-others`       | session    |                                            |
| `POST`   | `/api/v1/me/password`                     | session    | requires the current password              |
| `POST`   | `/api/v1/admin/users/:userId/roles`       | permission | `user:assign_role`                         |
| `DELETE` | `/api/v1/admin/users/:userId/roles/:role` | permission | `user:assign_role`                         |

### Responses that deliberately tell you nothing

Registration, resend, verification and forgot-password return the **same
response whether or not the address is known**, and a wrong, expired or
already-consumed token is a single indistinguishable failure.

This is not vagueness for its own sake. A `201`/`409` split turns the register
endpoint into an account-existence oracle for anyone willing to submit an
address, and distinguishing "expired" from "wrong" tells a token-guessing
attacker which guesses are close.

Clients must therefore phrase these outcomes as "if that address is registered,
we have sent a message" — the translated strings are written to that shape.

### Auth-specific rate limits

Tighter than the global default, per client address, on top of it:

| Endpoint              | Limit          |
| --------------------- | -------------- |
| `register`            | 5 / hour       |
| `resend-verification` | 5 / hour       |
| `verify-email`        | 10 / hour      |
| `login`               | 5 / 15 minutes |
| `refresh`             | 60 / hour      |

Per-_account_ limits, which per-address limits cannot provide, are enforced in
`AuthService` alongside the brute-force lockout.

## Catalogue

Public read endpoints. Design rationale for the multilingual storage is in
[ADR 0008](../architecture/decisions/0008-multilingual-content-storage.md).

| Method | Path                    | Auth   | Notes                                     |
| ------ | ----------------------- | ------ | ----------------------------------------- |
| `GET`  | `/api/v1/courses`       | public | cursor paginated; `subject`, `level`      |
| `GET`  | `/api/v1/courses/:slug` | public | `404` for a draft, same as a missing slug |

Both are `@Public()` — discovery is the front door, and a learner must be able
to see what is on offer before creating an account. The global guard still runs
and still attaches an actor when a session is present, which is what lets the
same endpoints show unpublished courses to a caller holding
`course:view_unpublished` without a second route.

**Language.** Course text is selected from `Accept-Language`, which the web app
sets from the active locale. An absent or unsupported value falls back to the
default rather than erroring.

Every course carries `textLocale` naming the language its text is **actually**
in. That is not always the language requested: content is written by people and
a translation may not exist yet, so the API falls back rather than returning an
empty title. Clients must surface that — showing unmarked Dari to a Pashto
reader leaves them unable to tell a missing translation from their own misreading.

### Caching

Catalogue responses carry `Vary: Accept-Language` alongside the `Origin` and
`Accept-Encoding` that CORS and compression add. The header is **appended**, not
assigned — overwriting it would drop the other two and trade one caching bug for
two.

This matters more than it looks. A shared cache keys on the URL plus whatever
`Vary` names; an undeclared header means the first visitor's language is served
to everyone after them, while the origin behaves perfectly and nothing in the
logs looks wrong. `Vary` is also set on error responses, since a cached 404 has
the same problem.

ETags already differ per locale, and a conditional request carrying another
locale's ETag correctly returns `200` rather than a false `304`.

**`Cache-Control` is deliberately not set yet.** Correct `Vary` is a
prerequisite for shared caching, not the whole of it: there is no CDN in front
of the API, nothing can author a course yet so the real mutation rate is
unknown, and there is no invalidation path for the moment a course _is_
published. Adding a TTL now would be guessing at all three. Revisit when a CDN
is actually deployed, and decide the TTL from the observed publish rate.

### Unknown cursors

A structurally valid cursor that matches no row returns `200` with an empty page
rather than `400`.

This is intended. A cursor goes stale for ordinary reasons — a bookmarked page,
a back button, a course unpublished since the link was made — and none of them
are client misuse. Returning an error would turn a normal stale-pagination state
into a failure the client has to special-case, for no gain: an empty page and
the end of a list are the same thing to a caller walking pages until
`nextCursor` is null.

## Request correlation

Send `x-request-id` and it is echoed back — but only if it matches
`^[A-Za-z0-9._-]{1,128}$`. Anything else is replaced with a fresh UUID, because
the value is written into log lines and would otherwise permit log injection.

## Validation

Zod schemas at the handler boundary, via `ZodValidationPipe`. The pipe returns
the _parsed_ value, so unknown keys are stripped before anything reaches Prisma
— closing the mass-assignment hole that turns "update my display name" into
"make me an admin".

Nest's class-validator `ValidationPipe` is deliberately not registered. Two
validation systems eventually disagree about what a valid payload is.

## Rate limiting

Redis-backed, applied globally as an `APP_GUARD`. New endpoints are protected by
default; opting out must be explicit. Responses carry `x-ratelimit-*` headers.

## Pagination

Cursor-based:

```
GET /api/v1/courses?cursor=<id>&limit=20
```

`limit` is 1..100, default 20. Responses have the shape
`{ "items": [], "nextCursor": null }`, with `nextCursor` null when the list is
exhausted.
