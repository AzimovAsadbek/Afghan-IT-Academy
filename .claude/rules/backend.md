---
description: NestJS API conventions
globs: apps/api/**
---

# Backend rules

## Module boundaries

`config` → `common` → `infrastructure` → `modules`. Dependencies point inward.

- A domain module may import `common`, `config`, `infrastructure`.
- Cross-module access goes through the other module's public `index.ts`. Deep
  imports fail lint.
- `infrastructure` and `common` must never import a domain module.

A new domain gets `modules/<domain>/` with a module, controller, service and
`index.ts` barrel. Business logic lives in the service, never the controller.

**A barrel is a module's public face — for consumers outside it.** Within a
module, import the concrete file (`../sessions/session.service.js`), never the
sibling barrel (`../sessions/index.js`).

A barrel re-exports everything in its folder, so importing one symbol through it
drags in the rest. The moment a controller in that folder imports back, there is
a cycle, and a class ends up `undefined` at decoration time. Nest reports that as
`can't resolve dependencies of X (..., ?, ...)` naming a provider that is present
and correctly registered — several layers away from the actual cause. It cost
real time once; the fix is mechanical, so do it by default.

The module-boundary lint rule enforces the other half of this — that outsiders
use the barrel. It deliberately permits intra-module imports, which is why this
one is a convention rather than a rule.

## Configuration

Inject the `ENV` token and read a typed property. Never call `process.env`
outside `src/config` — the lint rule blocks it.

Adding a variable means four edits, not three: `envSchema`, `.env.example`, a
test case, **and the e2e job's `env:` block in `.github/workflows/ci.yml`**.

Miss the last one and everything passes locally — where `.env` already has the
value — while CI fails at application boot with a config error, because the
schema is doing exactly what it should. It has happened once.

## Validation

Zod at the handler boundary via `ZodValidationPipe`. Share the schema with the
web app through `@afghan-it-academy/shared` when both sides validate the same
thing.

The pipe returns parsed output, so unknown keys are stripped. Use `.strict()`
when an unknown key should be an error rather than silently dropped.

Do not add class-validator. One validation library.

## Errors

Throw a Nest `HttpException` subclass, or `FieldValidationException` for
field-level failures. `AllExceptionsFilter` owns the response shape.

Never put user-facing prose in an error. Add a code to `ERROR_CODES` in
`packages/shared` instead — codes are permanent contract, so choose the name
once and carefully.

Never let an internal message, stack trace or driver error reach the client.

## Logging

Inject `Logger` from `nestjs-pino`. Structured objects, not string
concatenation: `logger.info({ userId, courseId }, 'Enrollment created')`.

Never log a credential, token, password or full request body. The redaction list
in `common/logging/logger.config.ts` is a backstop, not permission to be careless.

Every security-relevant action writes an `AuditLog` row.

## Database

- `select` only what is needed. `passwordHash` never leaves the data layer.
- No queries in a loop — use `include`/`select`.
- Multi-write operations go in `$transaction`.
- Cursor pagination via `paginationSchema`.
- Every ownership check is server-side. A route parameter is not authorization.

## Tests

Unit tests next to the source (`*.test.ts`), no infrastructure required.
E2E tests in `test/` (`*.e2e-spec.ts`), booting the real app via `configureApp`
so they exercise the production configuration rather than a hand-rolled copy.
