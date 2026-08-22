# Product overview

Afghan IT Academy is a multilingual, career-oriented education platform for
Afghanistan, covering IT, English and AI.

## Audience

Learners in Afghanistan, reading Dari (`fa-AF`), Pashto (`ps-AF`) or English
(`en`), typically on low-end phones over slow, metered, intermittent
connections.

## Learning loop

```
Discover → Assess → Learn → Practice → Build → Get Feedback → Assess → Prove → Career
```

Each stage maps to a backend domain:

| Stage            | Domain                                     |
| ---------------- | ------------------------------------------ |
| Discover         | catalogue                                  |
| Assess           | assessment                                 |
| Learn            | learning (modules, lessons, progress)      |
| Practice / Build | assessment (assignments, projects, coding) |
| Get Feedback     | ai, instructors                            |
| Prove            | certification                              |
| Career           | career profile                             |

Cross-cutting: identity, commerce, gamification, notifications, analytics.

## Scope note — the homepage mockup

The approved homepage design was supplied with **Uzbek** placeholder copy
(`Kurslar`, `IT yo'nalishlar`, `Biz haqimizda`). Uzbek is not a supported
locale; the design's own footer switcher correctly lists Dari · Pashto ·
English.

**Resolution:** the visual design is canonical, the copy is placeholder. All
strings come from `apps/web/messages/{locale}.json` in the three supported
locales. Raised here so the discrepancy is a recorded decision rather than a
future surprise.

## Current state

Foundation is complete and tagged `v0.1.0-foundation`: locale routing, RTL/LTR,
design tokens, API with health/observability/security baseline, database and
migration workflow.

The **authentication milestone is in progress** on `feat/m002-auth`. Accounts,
roles and permissions, sessions with refresh rotation, password recovery and
audit logging are implemented and verified on the API. **The web client still
has no authentication UI** — the only route that exists is the foundation
landing page.

Next: the authentication UI, then the course catalogue. See
[../roadmap/](../roadmap/).
