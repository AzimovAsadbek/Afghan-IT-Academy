# Claude Code configuration

| Path            | Purpose                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `../CLAUDE.md`  | Project identity, architecture, commands, non-negotiables. Loaded every session — kept short on purpose. |
| `rules/`        | Path-scoped rules. Loaded when a matching file is touched.                                               |
| `agents/`       | Project-specific agents. See `agents/README.md` for why there are only two.                              |
| `hooks/`        | Executable guards. Each has a documented purpose.                                                        |
| `settings.json` | Permissions and hook wiring.                                                                             |

## Rules

| File          | Applies to                         |
| ------------- | ---------------------------------- |
| `backend.md`  | `apps/api/**`                      |
| `frontend.md` | `apps/web/**`, `packages/ui/**`    |
| `database.md` | Prisma schema and data-access code |
| `security.md` | Everything                         |
| `i18n.md`     | Web, shared locales, UI            |
| `testing.md`  | Everything                         |

Rules must not repeat `CLAUDE.md`. If something belongs in both, it belongs in
the rule, and `CLAUDE.md` gets one line pointing at it.

## Hooks

| Hook                 | Event                        | Purpose                                                                                                                                                                                                         |
| -------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `protect-secrets.sh` | PreToolUse (Read/Edit/Write) | Blocks `.env*`, private keys and `secrets/`. The remote repository is public, so a secret in a diff or a log is a disclosure even if never committed. `.env.example` is allowed — it is the committed template. |
| `format-on-edit.sh`  | PostToolUse (Edit/Write)     | Runs Prettier on the edited file so diffs carry no formatting noise and `pnpm verify` never fails on `format:check`. Never fails the tool call.                                                                 |

Both are tested behaviourally; see the commit that introduced them.

## Permissions

`deny` covers secret files and irreversible Git operations (force push, hard
reset, `clean -fdx`). `ask` covers actions with outward or destructive effect —
commit, push, dropping database volumes, `migrate reset`. `allow` covers routine
read-only and build commands, to keep prompts meaningful rather than constant.

`settings.local.json` is git-ignored for machine-specific overrides.

## Skills

Do not recreate the bundled skills. `code-review`, `security-audit`,
`architecture-review`, `database-review`, `testing`, `performance-audit`,
`frontend-ui-engineer`, `ui-review`, `debug` and `ship` already exist and should
be used as-is.
