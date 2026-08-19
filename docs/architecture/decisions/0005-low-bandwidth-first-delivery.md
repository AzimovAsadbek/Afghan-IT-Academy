# ADR 0005 — Low-bandwidth-first delivery

- **Status:** Accepted
- **Date:** 2026-08-20

## Context

The audience is in Afghanistan: connections are slow, often metered, frequently
interrupted, and devices are typically low-end phones. Defaults in modern web
tooling assume the opposite on every axis.

A learner who pays per megabyte and loses connection mid-lesson is the design
target, not an edge case.

## Decision

Every layer carries an explicit bandwidth budget.

**Rendering** — all locale routes are statically pre-rendered (`● SSG`). HTML
arrives without a server round trip and is CDN-cacheable.

**Data fetching** (`apps/web/src/components/providers/query-provider.tsx`)
— TanStack Query defaults are overridden because the stock ones assume a fast,
always-on network:

| Setting                | Value              | Why                                                  |
| ---------------------- | ------------------ | ---------------------------------------------------- |
| `staleTime`            | 5 min              | Catalogue data barely changes within a study session |
| `refetchOnWindowFocus` | `false`            | Tab switching must not cost the user data            |
| `refetchOnReconnect`   | `true`             | Reconnection is exactly when stale data matters      |
| `retry`                | ≤2, never on 4xx   | A 404 will still be a 404; retrying burns quota      |
| `retryDelay`           | exponential, ≤10 s | Do not hammer a flaky link                           |
| `mutations.retry`      | `false`            | A blind retry could double-submit an enrollment      |

**Images** — AVIF first (20–30% smaller than WebP), `deviceSizes` tuned to real
low-end phone widths so a phone never downloads a 1920px asset, 30-day cache.

**Fonts** — `display: 'swap'` so text paints immediately; only the weights the
design uses; self-hosted.

**Transport** — compression on both API and web; `poweredByHeader` off; no
trailing-slash redirects (an extra round trip on a high-latency link).

**Motion** — `prefers-reduced-motion` honoured, which is also a battery and CPU
saving on low-end hardware.

## Consequences

- A visibly heavier feature must justify its bytes.
- Video, transcripts, downloadable resources and offline sync will be designed
  against this same budget rather than retrofitted.
- Performance regressions are a product bug, not a nice-to-have.
