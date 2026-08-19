# Database strategy

PostgreSQL 17 via Prisma 7.

## Prisma 7 notes

Prisma 7 removed `url` from the `datasource` block. The connection now comes
from two places:

| Consumer              | Source                                                                        |
| --------------------- | ----------------------------------------------------------------------------- |
| Application           | driver adapter (`@prisma/adapter-pg`) in `apps/api/src/infrastructure/prisma` |
| CLI (migrate, studio) | `apps/api/prisma.config.ts`                                                   |

This also drops the Rust query engine binary — roughly 40 MB off the production
image, which matters when images are pulled over Afghan bandwidth.

The client is generated into `apps/api/generated/prisma`, an explicit path, and
imported from there rather than from `@prisma/client`.

That is not a stylistic choice. With the default output the client is written
inside the `@prisma/client` package in the pnpm store, where two things destroy
it: any reinstall wipes it, and `pnpm deploy` builds a fresh dependency tree
whose store never had it. The second one is the dangerous case — the Docker
image builds successfully and then dies on its first query with
`Cannot find module '.prisma/client/default'`. An explicit output directory is
deterministic for local development, CI and Docker alike.

Because the output sits outside `node_modules`, `apps/api` declares
`@prisma/client-runtime-utils` as a direct dependency. pnpm's strict layout only
links declared dependencies into a package's own `node_modules`, and the
generated code requires that package at runtime — without the declaration the
container starts and dies with `Cannot find module
'@prisma/client-runtime-utils'`. **Keep its version in lockstep with
`@prisma/client`**; bump both together.

The directory is git-ignored and recreated by the `postinstall` hook, so a fresh
clone gets it from `pnpm install`. The relative import path is identical from
`src/` and `dist/` — both sit three levels below `apps/api` — so one specifier
works in development and in the built output.

## Current schema

Foundation scope only — identity core and audit log.

| Table        | Purpose                                                                           |
| ------------ | --------------------------------------------------------------------------------- |
| `users`      | Identity root. `email` unique; `passwordHash` nullable for future federated login |
| `audit_logs` | Append-only record of security-relevant actions                                   |

`audit_logs.actorId` is `ON DELETE SET NULL`, not cascade: the log must survive
deletion of the account it describes, which is precisely when it matters most.

The `Locale` enum mirrors `LOCALES` in `@afghan-it-academy/shared`, so the
database rejects an unsupported locale rather than storing it and failing at
render time.

## Why the other domains are not modelled yet

Creating tables for catalogue, assessment, commerce and gamification now would
freeze a design nothing has been built against. Each domain's schema lands with
the module that owns it, in the same migration as its first working feature.

Planned boundaries are recorded in
[../architecture/decisions/0002-modular-monolith.md](../architecture/decisions/0002-modular-monolith.md).

## Conventions

- **Identifiers**: `cuid()`. Sortable, non-guessable, no cross-shard collisions.
  Never expose a sequential integer id — it leaks volume and enables enumeration.
- **Naming**: `snake_case` tables via `@@map`, `camelCase` fields in code.
- **Timestamps**: `createdAt` / `updatedAt` on every mutable entity.
- **Soft delete**: not used by default. Added per-entity only where a real
  retention requirement exists; a global soft-delete flag makes every query a
  potential data leak when someone forgets the filter.
- **Indexes**: added with the query that needs them, and only then. Every index
  is a write cost.

## Migrations

```bash
pnpm db:migrate
```

```bash
pnpm --filter @afghan-it-academy/api prisma:deploy
```

Rules:

- Migrations are committed and never edited after being applied anywhere shared.
- Destructive changes are two-step: add and backfill, deploy, then remove.
- Every migration is reviewed for lock behaviour before it touches production —
  an `ALTER TABLE` that rewrites a large table takes an `ACCESS EXCLUSIVE` lock.

## Performance rules

- No N+1: use Prisma `include`/`select`, not per-row queries in a loop.
- `select` only the columns needed. `passwordHash` must never appear in a DTO.
- Cursor pagination, not offset — stable under concurrent inserts and does not
  degrade on deep pages. `paginationSchema` in `@afghan-it-academy/shared`.
- Multi-write operations run inside `$transaction`.
