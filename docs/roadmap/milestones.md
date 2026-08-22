# Milestones

Each milestone is one logical commit range and one Git tag. A milestone is done
when `pnpm verify` passes, its behaviour is verified at runtime, and it is
pushed.

| Tag                 | Milestone              | Contents                                                                       |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `v0.1.0-foundation` | **Foundation** ✅      | Monorepo, web + API skeletons, database, i18n/RTL, security baseline, CI, docs |
| `v0.2.0-auth`       | **Authentication** 🚧  | Registration, login, Argon2id, refresh-token rotation, RBAC, audit logging     |
| `v0.3.0-lms`        | Catalogue and learning | Courses, paths, modules, lessons, enrollment, progress, low-bandwidth player   |
| `v0.4.0-assessment` | Assessment             | Quizzes, exams, assignments, projects, coding tasks, certification             |
| `v0.5.0-ai`         | AI Mentor              | Tutoring, feedback, safety boundaries, cost controls                           |
| `v1.0.0-mvp`        | MVP                    | Commerce, gamification, career profile, analytics, production deployment       |

## Foundation — definition of done

| Item                                               | Status                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| Repository structure                               | ✅                                                                 |
| Web foundation (Next.js, 3 locales, RTL)           | ✅                                                                 |
| API foundation (NestJS, config, logging, security) | ✅                                                                 |
| Database foundation (Prisma, migration applied)    | ✅                                                                 |
| Local development works                            | ✅                                                                 |
| TypeScript strict passes                           | ✅                                                                 |
| Lint passes                                        | ✅                                                                 |
| Formatting stable                                  | ✅                                                                 |
| Docker foundation works                            | ✅ both production images built and verified serving real requests |
| Environment strategy                               | ✅                                                                 |
| Documentation                                      | ✅                                                                 |
| CLAUDE.md and rules                                | ✅                                                                 |
| Agents                                             | ✅                                                                 |
| Secret protection                                  | ✅                                                                 |
| CI foundation                                      | ✅                                                                 |
| Git identity verified                              | ✅                                                                 |
| Committed and pushed                               | ✅                                                                 |

## Authentication — definition of done

In progress on `feat/m002-auth` (PR #1, draft). The API is complete and verified;
the web client is not started.

| Item                                                     | Status                                            |
| -------------------------------------------------------- | ------------------------------------------------- |
| Identity, role, permission, session, token, audit schema | ✅ two migrations, convergent seed                |
| Argon2id hashing, opaque token primitives                | ✅                                                |
| Registration, email verification, login, logout          | ✅                                                |
| Sessions, refresh rotation, family reuse detection       | ✅ ADR 0006                                       |
| RBAC guards, permission enforcement, role administration | ✅ ADR 0007                                       |
| Password change, forgot, reset                           | ✅                                                |
| Audit logging, rate limiting, brute-force lockout        | ✅                                                |
| API tests                                                | ✅ 106 e2e against live Postgres + Redis, 67 unit |
| ADRs 0006 and 0007                                       | ✅                                                |
| API and security documentation                           | ✅                                                |
| **Authentication UI — 6 routes × 3 locales**             | ❌ not started                                    |
| **Nonce-based CSP for authenticated routes**             | ❌ blocked on the UI; see security/baseline.md    |
| **Security audit pass**                                  | ❌                                                |
| Tagged `v0.2.0-auth` and merged to `main`                | ❌                                                |

The six web routes: register, verify email, login, forgot password, reset
password, and account security (profile + session list + password change).

## Deferred, with reasons

| Item                      | Why deferred                                 | Trigger                     |
| ------------------------- | -------------------------------------------- | --------------------------- |
| `apps/mobile` (Flutter)   | Not a pnpm workspace member; would sit inert | Mobile milestone            |
| Production Docker Compose | Deployment target not chosen                 | Before first deploy         |
| OpenAPI generation        | No endpoints beyond health yet               | With the auth milestone     |
| Object storage adapter    | No uploads yet                               | With the learning milestone |
| BullMQ workers            | No background jobs yet                       | With notifications          |
