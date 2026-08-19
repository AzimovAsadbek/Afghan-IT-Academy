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
