# Afghan IT Academy

Multilingual, career-oriented education platform for Afghanistan — IT, English
and AI. Built for slow, metered connections and low-end devices.

**Languages:** دری (Dari) · پښتو (Pashto) · English

## Status

Foundation milestone (`v0.1.0-foundation`). The platform skeleton is in place;
no business features are implemented yet. See
[docs/roadmap/milestones.md](docs/roadmap/milestones.md).

## Stack

| Layer          | Technology                                                                    |
| -------------- | ----------------------------------------------------------------------------- |
| Web            | Next.js 16 (App Router), React 19, Tailwind CSS v4, next-intl, TanStack Query |
| API            | NestJS 11, Prisma 7, PostgreSQL 17, Redis 8, Pino                             |
| Shared         | TypeScript 6 (strict), Zod                                                    |
| Tooling        | pnpm workspaces, Turborepo, ESLint 10, Prettier, Vitest                       |
| Infrastructure | Docker, GitHub Actions                                                        |

## Getting started

Requires Node ≥ 24, pnpm ≥ 9.12, and Docker Desktop **running**.

```bash
pnpm install
```

```bash
cp .env.example .env
```

```bash
pnpm db:up
```

```bash
pnpm db:migrate
```

```bash
pnpm dev
```

- Web — <http://localhost:3000> (redirects to `/fa-AF`)
- API — <http://localhost:4000/api/health/ready>

Full setup notes, commands and troubleshooting:
[docs/infrastructure/local-development.md](docs/infrastructure/local-development.md).

## Repository layout

```
apps/
  web/         Next.js application
  api/         NestJS API (modular monolith)
packages/
  shared/      locales, error codes, validation primitives — used by both apps
  ui/          React primitives, logical CSS properties only
  tsconfig/    shared TypeScript configurations
  eslint-config/ shared flat ESLint configs, incl. module-boundary rules
docs/          architecture, ADRs, database, api, security, ux, roadmap
.claude/       agent rules, project agents, hooks
```

## Before committing

```bash
pnpm verify
```

Runs format check, lint, typecheck, tests and builds. CI runs the same, plus an
end-to-end suite against real Postgres and Redis, and a secret scan.

## Documentation

| Topic                          | Link                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| Product overview               | [docs/product/overview.md](docs/product/overview.md)                                   |
| Architecture decisions         | [docs/architecture/decisions/](docs/architecture/decisions/)                           |
| Database strategy              | [docs/database/strategy.md](docs/database/strategy.md)                                 |
| API conventions                | [docs/api/conventions.md](docs/api/conventions.md)                                     |
| Security baseline              | [docs/security/baseline.md](docs/security/baseline.md)                                 |
| Multilingual and accessibility | [docs/ux/multilingual-and-accessibility.md](docs/ux/multilingual-and-accessibility.md) |
| Roadmap                        | [docs/roadmap/milestones.md](docs/roadmap/milestones.md)                               |

## License

Proprietary. All rights reserved.
