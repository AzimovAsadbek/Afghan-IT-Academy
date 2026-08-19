# ADR 0004 — Multilingual and RTL architecture

- **Status:** Accepted
- **Date:** 2026-08-20

## Context

Three locales, two writing directions:

| Locale  | Language | Direction |
| ------- | -------- | --------- |
| `fa-AF` | Dari     | RTL       |
| `ps-AF` | Pashto   | RTL       |
| `en`    | English  | LTR       |

`fa-AF` is the default: it is the most widely read language of the primary
audience, and defaulting to English would make the product feel foreign to the
people it is for.

Region subtags are deliberate. `fa` alone means Iranian Persian, which differs
from Afghan Dari in vocabulary and conventions; `ps-AF` likewise distinguishes
Afghan Pashto.

## Decision

1. **Locale definitions live in `packages/shared`.** Web and API import the same
   `LOCALES`, direction map and metadata. Adding a language is one file.
2. **`localePrefix: 'always'`.** Every URL carries its locale. Hiding the prefix
   for the default locale produces two URLs for the same content, splitting SEO
   signal and making a shared link ambiguous about which language the recipient
   will see — a real problem where links travel over WhatsApp between speakers of
   different languages.
3. **`dir` is set once**, on `<html>` in the locale layout. No component decides
   its own direction.
4. **Logical CSS properties only.** `ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`,
   `text-start`/`text-end`. Physical utilities (`ml-`, `pr-`, `left-`) do not
   mirror; an ESLint rule in `packages/eslint-config/next.js` rejects them in
   `className` so RTL breakage fails the build rather than reaching a user.
5. **No user-facing string literals in components.** All copy comes from
   `messages/{locale}.json`.
6. **The API never returns user-facing prose.** It returns a stable
   `ERROR_CODES` value; the client translates it. This is what lets one API serve
   three languages without redeploying to fix a translation.
7. **Fonts are self-hosted at build time** via `next/font`. No runtime request to
   a third-party CDN — which may be slow or unreachable from Afghanistan — and no
   third party sees the visitor's IP. `Noto Sans Arabic` covers Dari and Pashto;
   `Inter` covers Latin.
8. **Time zone is fixed to `Asia/Kabul`.** Afghanistan uses one offset year-round,
   so dates render identically regardless of where the server runs.

## Consequences

- RTL is a property of the system, not a late-stage stylesheet.
- All three locales are statically pre-rendered, so a learner on a slow
  connection gets HTML from the edge rather than a server round trip.
- Adding a fourth locale requires: one entry in `LOCALES`, one message file, one
  font subset decision.
