# ADR 0006 — Opaque sessions and refresh-token rotation

- **Status:** Accepted
- **Date:** 2026-08-20

## Context

Authentication has to work for a learner in Afghanistan on a low-end phone over
an intermittent connection, and it has to be revocable the moment something goes
wrong. Those two pull in different directions: the first wants long-lived
credentials that survive a dropped link, the second wants short-lived ones.

The obvious default is a signed JWT access token. It is stateless, which is the
property everyone cites, but statelessness is precisely what makes it wrong
here:

- **Revocation is not real.** A signed token is valid until it expires. Logging
  out, suspending an account, or discovering a compromised device does nothing
  to a token already issued. The usual repair is a server-side deny-list —
  which reintroduces the per-request lookup JWT was chosen to avoid, and leaves
  the signature as decoration.
- **Permission changes lag.** Roles embedded in a token stay stale until it
  expires. An administrator revoking a capability during an incident cannot wait
  fifteen minutes.
- **Signing keys are an operational burden.** Generation, storage, rotation, and
  a rotation story that does not sign every user out. All of it is real work
  that buys nothing we need.

We also already pay for a Redis round trip on every request, because rate
limiting is Redis-backed (ADR 0005 and the security baseline). The marginal cost
of a session lookup on the same connection is close to zero — which removes the
single argument that would have favoured JWT.

## Decision

**Access tokens are opaque random strings resolved server-side against Redis.
Refresh tokens are opaque, single-use, and rotate. Both are delivered as
cookies.**

### Token shape

Both tokens are high-entropy random values from `TokenService`, carrying no
claims. Nothing is encoded in them, so nothing in them can be stale, forged, or
read by a client.

Only digests are ever stored. Redis holds a SHA-256 of the access token;
Postgres holds a SHA-256 of the refresh token in `refresh_tokens.tokenHash`. A
dump of either store hands an attacker no usable credential.

### Two-key session store

`SessionStore` (`apps/api/src/modules/identity/sessions/session-store.ts`) keeps
two Redis keys:

| Key                        | Lifetime                | Meaning                     |
| -------------------------- | ----------------------- | --------------------------- |
| `session:access:<digest>`  | access-token TTL (15 m) | this token → session + user |
| `session:live:<sessionId>` | session absolute TTL    | this session is still valid |

Validation requires **both**. That is the whole point: deleting the single
`live:` key invalidates every access token that session ever issued, at once,
without enumerating them. The dangling `access:` keys expire on their own, and
`resolve()` deletes one the moment it notices its session is gone.

The alternative — tracking every access token per session so they can be deleted
individually — needs a set that grows with every refresh and must be swept. This
does not.

### Durable record in Postgres

Sessions and the refresh-token chain are also written to Postgres, not only to
Redis, for two reasons: a user must be able to _see and revoke their own
devices_, and a Redis flush must not erase the security record of what was
signed in. Redis holds the fast path; Postgres holds the truth.

### Rotation and reuse detection

A refresh token is single-use. Exchanging it stamps `usedAt` on the old row and
appends a new row sharing the same `familyId`. Every token descended from one
login shares that family.

**Presenting an already-used refresh token revokes the entire family**, ending
every session descended from that login and writing an audit row and a warning
log.

The whole family, not just the replayed token, because a replay means two
parties hold the same credential and the server cannot tell which one is the
legitimate client. Revoking only the token presented would, half the time,
revoke the victim's copy and leave the attacker's working.

Rotation is claimed with a conditional write inside a transaction —
`updateMany({ where: { id, usedAt: null, revokedAt: null } })` — and not with a
read-then-write. Two simultaneous refreshes carrying the same token would
otherwise both observe `usedAt IS NULL` and both mint a pair. Exactly one update
matches; the loser is treated as a replay.

A rotated token never outlives its session: its expiry is
`min(now + refreshTtl, session.expiresAt)`.

### Cookie transport

`httpOnly`, so a successful XSS cannot read the token — an access token in
`localStorage` turns every XSS into full account takeover.

`Secure` outside development only, because `http://localhost` would otherwise
discard the cookie silently and every local login would appear to succeed and
then fail.

| Cookie           | SameSite | Path                   |
| ---------------- | -------- | ---------------------- |
| `aia_at` access  | `Lax`    | `/`                    |
| `aia_rt` refresh | `Strict` | `{API_PREFIX}/v1/auth` |

`Lax` for access, not `Strict`: `Strict` omits the cookie when a user follows a
link from their email client, which would present a signed-in user with a
signed-out page — a real journey here, since verification and password reset
both arrive by email.

`Strict` and path-scoped for refresh: it is the longer-lived, higher-value
credential and is only ever sent by our own JavaScript calling the refresh
endpoint, never by a cross-site navigation. Narrowing `Path` also keeps it off
the vast majority of requests, including anything a future proxy or log might
capture.

Both readers fall back to a bearer header (`readAccessToken`) so a future
Flutter client, which has no cookie jar worth the name, uses the same tokens and
the same endpoints. **The cookie takes precedence**, so a browser cannot be
tricked into authenticating with a header an attacker controls.

### CSRF

Cookie authentication raises CSRF, and the defence here is the cookie attributes
plus CORS rather than a synchroniser token:

- Every mutation is a `POST`/`DELETE` with a JSON body. `SameSite=Lax` withholds
  the access cookie from cross-site requests of that kind.
- The refresh cookie is `SameSite=Strict` and path-scoped — off the CSRF surface
  entirely.
- CORS is an explicit allow-list with no origin reflection, so a cross-origin
  script cannot read a response even where it can provoke a request.
- No `GET` endpoint mutates state, which is the case `Lax` would not cover.

A synchroniser-token layer buys little on top of this and costs a token endpoint,
a client-side round trip on a metered connection, and a new failure mode. **Add
one if a state-changing `GET` or a cross-site form post ever becomes necessary** —
that is the trigger, and it should not be crossed casually.

## Consequences

- Revocation is immediate and total: logout, "sign out other devices", a
  suspension, or a detected replay all take effect on the next request.
- Permission changes apply on the next request rather than at token expiry
  (bounded further by the 60-second cache in ADR 0007).
- Every authenticated request costs a Redis lookup. Acceptable because rate
  limiting already required Redis on the same path.
- **Redis is now on the critical path for authentication.** If Redis is down,
  authenticated requests fail. The health endpoint already reports cache status,
  and the durable session record in Postgres means a Redis loss signs users out
  rather than corrupting anything.
- Tokens cannot be validated by an outside service without calling this API.
  Acceptable for a modular monolith; revisit if a genuinely separate service
  ever needs to authenticate independently.
- The mobile client shares one credential model with the web client.
