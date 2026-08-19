---
description: Security requirements for all code
globs: apps/**, packages/**
---

# Security rules

The remote repository is **public**. Treat every commit accordingly.

## Never

- Commit `.env`, a key, a token or a credential.
- Put anything sensitive behind `NEXT_PUBLIC_`.
- Trust a client-supplied role, permission, user id or ownership claim.
- Return an internal error message, stack trace or SQL to a client.
- Log a password, token, session id or full request body.
- Interpolate user input into a raw query. Prisma is parameterised — keep it that way.
- Reflect an `Origin` header back as `Access-Control-Allow-Origin`.
- Weaken a check "temporarily" to unblock development.

## Always

- Validate every input with Zod, at the boundary, before it reaches business logic.
- Check ownership server-side for every resource access — `/courses/:id` proves
  nothing about who may read it.
- Return the parsed value from validation, not the raw input, so unknown keys
  cannot reach Prisma.
- Write an `AuditLog` row for security-relevant actions: login, permission
  change, role change, deletion, payment.
- Truncate stored IP addresses to a /24 (IPv4) or /48 (IPv6) prefix — enough to
  investigate abuse, not enough to track a learner.
- Give an environment variable a validated schema entry before using it.

## When auth lands

- Argon2id for password hashing. Never bcrypt with a low cost, never SHA-anything.
- Refresh tokens rotate, with reuse detection that revokes the family.
- Access tokens short-lived; refresh tokens in `httpOnly`, `Secure`, `SameSite`
  cookies.
- Failed-login responses must not reveal whether the account exists.
- Rate-limit auth endpoints more aggressively than the global default.
- Add a test asserting `passwordHash` never appears in any API response.

## Reviewing your own change

- [ ] Could a user reach another user's data by changing an id?
- [ ] Is every new input validated?
- [ ] Does any error path leak internals?
- [ ] Does anything new get logged that should not be?
- [ ] Is the new endpoint rate-limited?
- [ ] Would this be safe if the request came from an attacker rather than the UI?

Use the `security-audit` skill for a full pass; do not reimplement it here.
