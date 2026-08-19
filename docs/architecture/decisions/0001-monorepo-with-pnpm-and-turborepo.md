# ADR 0001 — pnpm workspaces with Turborepo

- **Status:** Accepted
- **Date:** 2026-08-20

## Context

The platform ships a Next.js web app and a NestJS API today, and a Flutter
mobile app later. Web and API must agree on locale codes, error codes and
validation rules; when those definitions are duplicated they drift, and the
symptom appears as a production bug in a language nobody on the team reads.

## Decision

A single repository using pnpm workspaces, with Turborepo for task
orchestration and caching.

`packages/`:

| Package         | Purpose                                                                            |
| --------------- | ---------------------------------------------------------------------------------- |
| `shared`        | Locale definitions, error codes, Zod validation primitives — imported by both apps |
| `ui`            | React primitives written against logical CSS properties                            |
| `tsconfig`      | Base/Next/Nest/library TypeScript configurations                                   |
| `eslint-config` | Flat ESLint configs, including the module-boundary rules                           |

## Consequences

- One `pnpm install`, one lockfile, one CI pipeline.
- A change to a shared contract fails the build of every consumer immediately,
  which is the entire point.
- pnpm's non-flat `node_modules` prevents phantom dependencies: a package that
  imports something it did not declare fails, rather than working by accident
  until a hoisting change breaks it.
- Turborepo caching keeps repeated `lint`/`typecheck`/`build` runs near-instant.

## Deviations from the original proposal

- **`packages/config` was not created.** Its responsibilities are already fully
  covered by `tsconfig`, `eslint-config` and `shared`. An empty fourth package
  would only invite the same constant to be defined in two places.
- **`apps/mobile` was not created.** Flutter is not a pnpm workspace member and
  would sit in the tree as a non-participating folder. It will be added when
  mobile work starts, with its own toolchain; the shared contracts it needs are
  in `packages/shared` and will be mirrored or code-generated at that point.

## Alternatives considered

- **Separate repositories.** Rejected: cross-repo contract changes need
  coordinated releases, which is overhead a small team pays daily.
- **npm/yarn workspaces.** Rejected: neither prevents phantom dependencies as
  effectively, and pnpm's disk and install-time savings are significant here.
