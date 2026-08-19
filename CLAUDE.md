# Afghan IT Academy

Multilingual EdTech platform for Afghanistan — IT, English and AI education.
Production system, not a prototype.

Detailed procedures live in `.claude/rules/` (path-scoped) and `docs/`. Keep this
file short; it is loaded into every session.

## Architecture

pnpm + Turborepo monorepo. NestJS modular monolith, Next.js App Router.

```
apps/web         Next.js 16, App Router, /[locale] routing, Tailwind v4
apps/api         NestJS 11, modular monolith, Prisma 7 + PostgreSQL 17, Redis 8
packages/shared  locales, error codes, Zod primitives — used by BOTH apps
packages/ui      React primitives, logical CSS properties only
packages/tsconfig, packages/eslint-config
docs/            architecture, ADRs, database, api, security, ux, roadmap
```

API layering — dependencies point inward, enforced by `no-restricted-imports`:

```
config/          validated environment; imported by everything
common/          cross-cutting HTTP concerns; no domain knowledge
infrastructure/  Prisma, Redis adapters; no business rules
modules/         business domains; the only place domain logic lives
bootstrap/       app composition, shared by main.ts and the e2e suite
```

A domain module may use `infrastructure`. `infrastructure` may never import a
domain module. Cross-module imports go through the module's public `index.ts`.

## Commands

```bash
pnpm install
pnpm db:up            # Postgres + Redis (Docker Desktop must be running)
pnpm db:migrate
pnpm dev              # web :3000, api :4000
pnpm verify           # format + lint + typecheck + test + build — run before committing
```

```bash
pnpm --filter @afghan-it-academy/api test:e2e   # needs pnpm db:up
```

## Non-negotiables

- **TypeScript strict.** `any` requires an eslint-disable with a written reason.
- **Locales are `en`, `fa-AF`, `ps-AF`.** Default `fa-AF`. Dari and Pashto are
  RTL. Never hardcode user-facing text. Never use physical CSS direction
  utilities (`ml-`, `pr-`, `left-`) — logical only (`ms-`, `pe-`, `start-`).
- **The API returns error codes, never user-facing prose.** The client
  translates. `ERROR_CODES` values are permanent contract.
- **Environment access only through `src/config`.** Never `process.env` elsewhere.
  Secrets have no defaults.
- **Authorization is server-side, always.** Never trust a client claim.
- **Low bandwidth is a requirement.** Every added kilobyte needs a reason. See
  `docs/architecture/decisions/0005-low-bandwidth-first-delivery.md`.
- **Never commit `.env`, keys or credentials.** The remote repository is public.

## Versions (pinned deliberately)

TypeScript is pinned to **6.0.3** — `typescript-eslint` does not yet support
TypeScript 7, and type-aware linting is part of the correctness baseline. See
`docs/architecture/decisions/0003-typescript-version-pin.md` before changing it.

Node ≥ 24 (Prisma 7 requires it). pnpm ≥ 9.12.

## Git

- Commits are authored by the repository owner. **Never add AI attribution or
  `Co-authored-by` trailers.**
- Conventional Commits. Inspect `git diff` before committing.
- Logical milestone commits, not one per edit. Tag milestones (`v0.1.0-foundation`).
- Never force-push, never rewrite shared history, `main` stays stable.

## Definition of done

`pnpm verify` passes, behaviour is verified at runtime (not just by reading the
code), tests cover the change, and no secret is exposed. If a check was skipped,
say so.

## Skills

Use the existing skills rather than reimplementing their work: `code-review`,
`security-audit`, `architecture-review`, `database-review`, `testing`,
`performance-audit`, `frontend-ui-engineer`, `ui-review`, `debug`, `ship`.
