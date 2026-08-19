# ADR 0003 — TypeScript pinned to 6.0.3

- **Status:** Accepted
- **Date:** 2026-08-20

## Context

At bootstrap, `typescript@latest` resolved to **7.0.2**, the native port.
`typescript-eslint@8.67.0` declares:

```
peerDependencies.typescript: ">=4.8.4 <6.1.0"
```

TypeScript 7 is therefore outside the supported range for type-aware linting.

## Decision

Pin TypeScript to **6.0.3** exactly, via `pnpm.overrides` in the root
`package.json` so no transitive dependency can drag in a different version.

## Rationale

Type-aware lint rules — `no-floating-promises`, `no-misused-promises`,
`no-unsafe-*`, `switch-exhaustiveness-check` — are a substantial part of the
correctness and security baseline. During this bootstrap alone they caught an
unreachable Redis health check, an unsafe enum comparison, and `any` leaking out
of a dynamic import. Trading them for a compiler version bump is a bad trade.

## Upgrade trigger

Move to TypeScript 7 when `typescript-eslint` publishes a release whose peer
range admits it. The check is one command:

```bash
npm view typescript-eslint@latest peerDependencies
```

Bump both together, then run `pnpm verify`.
