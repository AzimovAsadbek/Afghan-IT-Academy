# Milestones

Each milestone is one logical commit range and one Git tag. A milestone is done
when `pnpm verify` passes, its behaviour is verified at runtime, and it is
pushed.

| Tag                 | Milestone              | Contents                                                                       |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `v0.1.0-foundation` | **Foundation** ✅      | Monorepo, web + API skeletons, database, i18n/RTL, security baseline, CI, docs |
| `v0.2.0-auth`       | Authentication         | Registration, login, Argon2id, refresh-token rotation, RBAC, audit logging     |
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

## Deferred, with reasons

| Item                      | Why deferred                                 | Trigger                     |
| ------------------------- | -------------------------------------------- | --------------------------- |
| `apps/mobile` (Flutter)   | Not a pnpm workspace member; would sit inert | Mobile milestone            |
| Production Docker Compose | Deployment target not chosen                 | Before first deploy         |
| OpenAPI generation        | No endpoints beyond health yet               | With the auth milestone     |
| Object storage adapter    | No uploads yet                               | With the learning milestone |
| BullMQ workers            | No background jobs yet                       | With notifications          |
