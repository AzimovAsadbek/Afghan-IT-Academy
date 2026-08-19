---
description: Testing requirements
globs: apps/**, packages/**
---

# Testing rules

Vitest everywhere.

## What to test

Test behaviour that would be a bug if it broke:

- validation boundaries — what is rejected, not only what is accepted;
- authorization — that the wrong user is denied;
- error paths and edge cases;
- anything security-relevant;
- locale and direction handling.

Do not test the framework, and do not write a test that only restates the
implementation. A test that cannot fail is worse than no test — it costs
maintenance and buys confidence it has not earned.

## Where

| Kind    | Location                          | Infrastructure                    |
| ------- | --------------------------------- | --------------------------------- |
| Unit    | beside the source, `*.test.ts(x)` | none                              |
| API e2e | `apps/api/test/*.e2e-spec.ts`     | Postgres + Redis via `pnpm db:up` |

E2E tests boot the real application through `configureApp`, the same function
`main.ts` uses. Do not hand-configure the app in a test: it drifts from
production, and the security middleware becomes the part nobody tests.

## Style

- Explicit imports from `vitest`; `globals` is off deliberately.
- One behaviour per test. The name states the behaviour, not the method called:
  "replaces a malformed inbound request id" beats "tests requestId".
- React tests clean up via the `afterEach(cleanup)` in `vitest.setup.ts`.
- Assert on observable output, not internal calls.

## Before saying a change works

Run it. `pnpm verify` for the workspace; the e2e suite when the API changed;
the actual UI in `fa-AF` when the frontend changed.

Never report success from reading the code alone. If something was not verified,
say which part and why.
