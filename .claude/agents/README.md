# Project agents

Only agents that add project-specific judgment live here. General engineering
review is already covered by the bundled skills — `code-review`,
`security-audit`, `architecture-review`, `database-review`, `testing`,
`performance-audit`, `frontend-ui-engineer`, `ui-review`, `debug`, `ship` — and
duplicating them would mean two sets of instructions drifting apart.

| Agent                   | Why it exists                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `i18n-rtl-reviewer`     | RTL and translation defects are invisible to a reviewer reading English on a desktop. No bundled skill covers this. |
| `low-bandwidth-auditor` | `performance-audit` is generic; this enforces the specific Afghanistan delivery budget in ADR 0005.                 |

Module-boundary enforcement is deliberately _not_ an agent — it is a lint rule
in `packages/eslint-config/nest.js`, so violations fail CI rather than depending
on someone remembering to ask.
