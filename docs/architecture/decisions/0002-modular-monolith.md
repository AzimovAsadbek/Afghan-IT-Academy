# ADR 0002 — Modular monolith for the API

- **Status:** Accepted
- **Date:** 2026-08-20

## Context

The product spans many domains — identity, catalogue, assessment,
certification, commerce, gamification, AI, notifications, analytics. A domain
list that long invites a microservice per domain.

We have no traffic data, no team boundaries to mirror, and no independent
scaling requirement that has actually been observed. Splitting now would buy
distributed transactions, network failure modes and a deployment pipeline per
service, in exchange for benefits nobody has yet measured a need for.

## Decision

One deployable NestJS application, internally organised by business domain.

```
src/
  config/           validated environment; imported by everything
  common/           cross-cutting HTTP concerns; no domain knowledge
  infrastructure/   technical adapters (Prisma, Redis); no business rules
  modules/          business domains; the only place domain logic lives
  bootstrap/        application composition
```

Dependency rules, enforced by the `boundaries/module-boundaries` rule in
`packages/eslint-config/module-boundaries.js` rather than by review:

1. A domain module may import `common`, `config` and `infrastructure`.
2. A domain module may import another module **only through its public
   `index.ts`**. Deep imports into another module's internals fail lint.
3. `infrastructure` and `common` may never import a domain module.

## Consequences

- A single transaction spans domains without a saga.
- Refactoring a boundary is a file move, not a service migration.
- If a domain later needs independent scaling, its module already has an
  enforced public interface, which is most of the extraction work.
- The discipline is mechanical, not cultural: violating a boundary fails CI.

### Enforcement was rewritten in M002

The original implementation used `no-restricted-imports` patterns. That rule
matches the import _specifier string_, not the file it resolves to, so the most
likely violation — a sibling import written `../identity/crypto/x.js` — contained
no `modules/` segment and matched nothing. A probe confirmed it linted clean, and
it had been inert since M001 because only one module existed.

No string pattern can fix this: a legitimate intra-module import and a
cross-module violation are the same shape. The replacement is a local rule that
resolves both paths and compares which module each file belongs to. It has its
own test suite (`module-boundaries.test.js`), because a rule that silently stops
firing is worse than no rule — it produces documented confidence in a guarantee
that does not exist.

## When to revisit

Extract a service only when at least one is demonstrably true, with evidence:

- a domain's resource profile is incompatible with the rest (e.g. AI inference
  needing GPUs);
- an independent team owns it end to end and deployment coupling is measurably
  slowing them down;
- a compliance boundary requires physical separation.

"It would scale better" is not evidence.
