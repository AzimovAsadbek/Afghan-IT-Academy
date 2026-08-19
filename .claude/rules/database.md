---
description: Prisma and PostgreSQL conventions
globs: apps/api/prisma/**, apps/api/src/infrastructure/prisma/**, apps/api/src/modules/**
---

# Database rules

PostgreSQL 17, Prisma 7 with the `@prisma/adapter-pg` driver adapter.

## Schema

- `cuid()` identifiers. Never expose a sequential integer id — it leaks volume
  and invites enumeration.
- `snake_case` table names via `@@map`; `camelCase` fields in code.
- `createdAt` and `updatedAt` on every mutable entity.
- Comment _why_ a column exists when it is not obvious. The type already says what.
- Add an index when a query needs it, not speculatively. Every index costs writes.
- Model a domain's tables in the migration that ships that domain's first
  feature, not before.

## Migrations

- `pnpm db:migrate` in development; `prisma:deploy` in CI and production.
- Commit migrations. Never edit one that has been applied anywhere shared.
- Destructive change is two-step: add and backfill, deploy, then remove.
- Check lock behaviour before a migration touches production. An `ALTER TABLE`
  that rewrites a large table takes an `ACCESS EXCLUSIVE` lock and blocks reads.

## Queries

- `select` only the columns needed. `passwordHash` must never leave the data layer.
- No query inside a loop. Use `include`/`select`.
- Multi-write operations go in `$transaction`.
- Cursor pagination via `paginationSchema`, never offset.
- Filter by owner in the query itself. Fetching then checking in application code
  is a race and an easy thing to forget.

## After a schema change

`pnpm db:generate` regenerates the client. It is also run automatically by
`postinstall`, because the generated client lives inside the pnpm store and any
reinstall wipes it.

Use the `database-review` skill for a deeper pass.
