---
description: Next.js and React conventions
globs: apps/web/**, packages/ui/**
---

# Frontend rules

## Server and client components

Server Components by default. Add `'use client'` only when the component needs
state, an effect, a browser API or an event handler.

Every client component ships JavaScript to a user on a metered connection. Push
the boundary as far down the tree as possible: make the leaf interactive, not
the page.

Never import a server-only module into a client component. Never place a secret
behind `NEXT_PUBLIC_`.

## Routing and i18n

- Import `Link`, `redirect`, `useRouter`, `usePathname` from `@/i18n/navigation`,
  never from `next/link` or `next/navigation`. The plain versions drop the locale
  prefix and bounce the user back to the default language.
- All copy comes from `messages/{locale}.json`. Adding a string means adding it
  to all three files.
- Call `setRequestLocale(locale)` in every page and layout under `[locale]`, or
  the route silently falls back to dynamic rendering.

## Styling

Tailwind v4, configured in CSS (`app/globals.css`), not a JS config file.

**Logical properties only.** `ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`,
`text-start`/`text-end`, `border-s-`/`border-e-`. Physical utilities fail lint
anywhere in a `className` string literal.

The rule covers `className` string literals only. Template literals, variant maps
and conditional class expressions are not checked — assert on the rendered
`className` in a component test instead, as `packages/ui/src/button.test.tsx`
does.

Use design tokens from `@theme` (`bg-brand-600`, `text-ink-900`). Do not
introduce a raw hex value in a component.

**Workspace packages must be registered as Tailwind sources.** Tailwind v4 skips
`node_modules`, and workspace packages resolve through a symlink inside it, so a
utility used _only_ by `packages/ui` is never generated. `globals.css` has an
`@source` line for it; add one for any new package that ships classes.

This fails silently and convincingly: the component still picks up colours the
app happens to use elsewhere, so it looks styled while its sizing, padding and
radius are simply missing. Check a new package's components in the browser, not
only in a test.

## Data fetching

Fetch in Server Components where possible — no client JavaScript, no waterfall.

TanStack Query is for client-side interactive data. Do not override the defaults
in `query-provider.tsx` per-query without a reason: they are tuned for slow,
metered connections and are documented in ADR 0005.

## Performance

- `next/image` always. Plain `<img>` fails lint.
- `next/font` only. Never a runtime font CDN request.
- Prefer CSS over JavaScript for anything CSS can do.
- Before adding a dependency to the client bundle, check its size and whether a
  50-line local implementation would do.

## Accessibility

Semantic HTML first. `jsx-a11y` rules are errors.

Keyboard navigable, visible focus ring, ≥44px touch targets, labelled form
controls, `prefers-reduced-motion` honoured.

Verify a UI change by reading it in `fa-AF` (RTL) at 320px width, not only in
English on a desktop.
