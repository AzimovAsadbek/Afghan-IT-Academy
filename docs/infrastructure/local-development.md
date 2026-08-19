# Local development

## Prerequisites

| Tool           | Version    | Notes                                                           |
| -------------- | ---------- | --------------------------------------------------------------- |
| Node           | ≥ 24       | Prisma 7 requires it; `process.loadEnvFile` is used natively    |
| pnpm           | ≥ 9.12     | `corepack enable` installs the pinned version                   |
| Docker Desktop | any recent | **Must be running** — it does not start with Windows by default |

## First run

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm dev
```

- Web: <http://localhost:3000> → redirects to `/fa-AF`
- API: <http://localhost:4000/api/health/ready>

## Commands

| Command                                         | Purpose                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                                      | Web and API together, watch mode                                        |
| `pnpm verify`                                   | format check → lint → typecheck → test → build. Run before every commit |
| `pnpm test`                                     | Unit tests (no infrastructure needed)                                   |
| `pnpm --filter @afghan-it-academy/api test:e2e` | E2E against real Postgres and Redis; needs `pnpm db:up`                 |
| `pnpm db:up` / `db:down` / `db:logs`            | Postgres + Redis containers                                             |
| `pnpm db:migrate`                               | Create and apply a migration                                            |
| `pnpm db:studio`                                | Prisma Studio                                                           |

## Services

| Service     | Port             | Notes                                                                    |
| ----------- | ---------------- | ------------------------------------------------------------------------ |
| Postgres 17 | `127.0.0.1:5432` | Loopback only; `--locale=C` so index collation matches CI and production |
| Redis 8     | `127.0.0.1:6379` | `appendonly yes`; rate-limit counters and queues survive a restart       |

Both have healthchecks; `docker compose ps` shows `(healthy)` when ready.

Application containers are intentionally not in `docker-compose.yml`: running
web and API on the host keeps hot reload fast and avoids Windows bind-mount I/O
penalties. Production images are built from `apps/*/Dockerfile`.

## Windows notes

- `core.autocrlf=true` is set globally on the development machine.
  `.gitattributes` normalises to LF in the repository so shell scripts work
  inside Linux containers and CI.
- If Docker commands fail with `npipe:////./pipe/dockerDesktopLinuxEngine`,
  Docker Desktop is not running.

## Troubleshooting

**`@prisma/client` has no exported members** — the generated client lives inside
the pnpm store and is wiped by any reinstall. `pnpm install` regenerates it via
the `postinstall` hook; run `pnpm db:generate` to force it.

**API exits at startup with `Invalid environment configuration`** — this is
working as designed. The message lists every offending variable at once; fix
them in `.env` and restart.

**`next build` warns `IO error: provided value is too long when setting link
name`** — a Windows path-length limit hit while `output: 'standalone'` creates
symlinks under `.next/standalone`. The build still succeeds, and Linux CI and
the Docker images are unaffected.

**`pnpm --filter @afghan-it-academy/web start`** runs the standalone server, not
`next start` — the two are incompatible. Static assets must be staged alongside
it first, which is what the Dockerfile does:

```bash
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/
```

**`next build` fails with `EBUSY ... rmdir .next/standalone`** — a server is
still running from that directory. Stop it and rebuild.
