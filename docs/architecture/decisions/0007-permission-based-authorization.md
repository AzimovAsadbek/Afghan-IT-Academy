# ADR 0007 — Permission-based authorization

- **Status:** Accepted
- **Date:** 2026-08-20

## Context

The platform has more kinds of staff than it has kinds of account: instructors,
content reviewers, content managers, support agents, finance managers, analysts,
administrators. Their capabilities overlap partially and will keep shifting as
the product grows.

The reflex is a `role` column and checks like `if (user.role === 'ADMIN')`. It
fails in ways that are cheap to predict and expensive to unwind:

- It cannot express "this one support agent may issue refunds" without inventing
  a role per exception.
- Every capability question becomes a role list scattered through the codebase,
  and each new role means finding and editing all of them.
- The checks drift. One handler says `ADMIN`, another says
  `ADMIN || SUPER_ADMIN`, and nobody can say which is right.
- A user holds exactly one role, so an instructor who also does support needs a
  combined role that duplicates both.

There is a second, structural problem. Authorization has to be enforced by
guards, guards are cross-cutting HTTP concerns and therefore belong in `common/`,
but resolving _who_ the caller is requires the identity domain. `common` may
never import a domain module (ADR 0002). Left unsolved, this either puts the
guards in `identity` — making every future domain import identity — or drags
domain knowledge into `common`.

## Decision

**Authorization is checked against permission keys, never role names. Roles are
a grouping convenience for administrators.**

### The permission catalogue

`packages/shared/src/authorization/permissions.ts` holds the catalogue, named
`resource:action` — `course:publish`, `payment:refund`, `user:assign_role`.

It lives in `shared`, not in the API, because the web app needs the same keys to
decide whether to _render_ a control. The asymmetry is deliberate and worth
stating plainly: **the client uses these only to decide what to show. Every
decision that matters is enforced again on the server, because a hidden button
is not a security control.**

Keys are permanent contract — stored in the database, referenced by seeded
grants, and potentially checked by a mobile client already in the field.
Renaming one silently removes an administrator's capability.

Adding a _role_ never requires a code change. Adding a _permission_ does,
because something has to enforce it.

### Data model

`User → UserRole → Role → RolePermission → Permission`. A user may hold several
roles; **effective permissions are the union across them**. That is what lets an
instructor also be a support agent without inventing a combined role.

Roles and permissions are reference data, seeded convergently by
`apps/api/prisma/seed.mts`, so re-running the seed is always safe. Seeded roles
carry `isSystem: true` to guard against an administrator deleting `STUDENT` and
breaking registration.

`UserRole.assignedById` records who granted a role but is **not** a foreign key:
the grant record must outlive the granting account.

### Seeded grants

`STUDENT` holds **no permissions at all**. A learner needs none for their own
study — access to one's own data is ownership, not a permission, and modelling
it as one would mean every learner carries a grant that could be misread as
elevated.

`SUPER_ADMIN` holds everything. `ADMIN` holds everything **except**
`user:assign_role` and `role:manage`.

That exclusion is the deliberate one: the capability that creates every other
capability is reserved to `SUPER_ADMIN`. An administrator who could grant roles
could grant themselves any permission, which makes every other restriction on
`ADMIN` decorative.

### Guards, and the `ActorResolver` port

Two global guards in `app.module.ts`, ordered after `ThrottlerGuard` so a flood
of anonymous requests is rejected before any session lookup:

1. `AuthenticationGuard` — resolves the credential, attaches an
   `AuthenticatedActor` to the request.
2. `PermissionsGuard` — enforces whatever `@RequirePermissions()` the route
   declares.

**Both are global, so every route is authenticated and permission-checked unless
it opts out with `@Public()`.** Secure by default: an endpoint added next year is
protected without anyone remembering to protect it. The inverse — opt-in
protection — fails silently the first time someone forgets, and the omission is
invisible in review.

The layering problem is solved with a port. `common/authorization/actor.ts`
declares `ActorResolver` and the `ACTOR_RESOLVER` symbol; `identity` provides
the implementation at composition time. `common` therefore knows an _interface_,
not the identity module.

The consequence that matters: a future domain wanting `@RequirePermissions`
imports it from `common` and takes **no dependency on identity at all**. Without
this, identity becomes a hub that every module imports, which is how a modular
monolith quietly turns into a ball of mud.

`AuthenticatedActor` carries `userId`, `sessionId` and `permissions` —
deliberately _not_ the `User` entity. Handing a guard the whole account invites
handlers to read fields that were never authorised and to serialise ones that
must not leave the data layer.

### Permission caching

Resolving effective permissions is a three-table join answering a question whose
answer changes a few times a year, on every authenticated request. `PermissionCache`
keeps the result in Redis for **60 seconds**.

Sixty seconds is the ceiling on stale authorization. Longer, and revocation stops
feeling immediate — giving back exactly the weakness opaque sessions were chosen
to avoid (ADR 0006). Shorter, and the cache stops earning its place.

**The TTL is a backstop, not the mechanism.** Every write that changes a user's
effective permissions — role grant, role revocation, suspension, reactivation —
calls `invalidate(userId)` directly. Relying on the TTL instead would leave a
revoked capability live for up to a minute, and "up to a minute" is precisely
what an administrator revoking access during an incident cannot accept.

A malformed cache entry is treated as a miss, not parsed leniently. This value
decides authorization, so "parse loosely" is the wrong instinct.

### Denials

A missing permission is `403 FORBIDDEN` and **does not name the permission that
was missing**. An authenticated user probing endpoints should not be handed a map
of what they would need to acquire.

Every role grant and revocation writes an `AuditLog` row.

## Consequences

- Capability changes are usually data changes — a grant, not a deployment.
- `if (user.role === ...)` is a review failure anywhere in the codebase.
- Permission keys are contract and cannot be renamed casually. Choose the name
  once and carefully.
- Authorization costs one Redis read on a cache hit, a three-table join on a
  miss.
- Roles remain the administrative surface: humans reason about "support agent",
  not about eighteen permission keys.
- **Permissions answer "what may this kind of user do", never "does this row
  belong to them".** Ownership is a separate check and must be expressed as a
  filter in the query itself — `/courses/:id` proves nothing about who may read
  it. Both checks are required for owned resources; neither substitutes for the
  other.
