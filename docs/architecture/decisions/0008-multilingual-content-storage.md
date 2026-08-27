# ADR 0008 — Multilingual content storage

- **Status:** Accepted
- **Date:** 2026-08-24

## Context

The interface has been multilingual since the foundation: every string comes
from `messages/{locale}.json` and the client owns the wording (ADR 0004). The
catalogue is the first domain where that is not enough, because a course title
is not interface copy — it is written by an instructor, stored in the database,
and can change without a deploy.

Two kinds of text now exist, and conflating them produces a system that is wrong
in one direction or the other:

- **Controlled vocabulary** the product defines — subjects, course levels, role
  names, permission names. Small, closed sets that change with a code change
  anyway.
- **Authored content** — course titles, summaries, descriptions. Open-ended,
  written by people, one row per course.

A further complication: content is rarely translated all at once. Pashto
routinely lands after Dari. Any design has to answer what a reader sees in the
gap, and "an empty card" is not an acceptable answer.

## Decision

**Controlled vocabulary is translated on the client. Authored content is
translated in the database, one row per locale.**

### Controlled vocabulary

`Subject` carries a stable `key` (`IT`, `ENGLISH`, `AI`) and no translation
table. The display name lives in `messages/{locale}.json`, exactly like role and
permission names already do.

Adding a subject is a row plus three message entries. That is the same shape as
adding any other piece of interface copy, and it keeps the translator's work in
one place instead of splitting it between a JSON file and a database table.

### Authored content

`CourseTranslation` is a row per `(courseId, locale)`, with the composite pair
as the primary key.

Rejected alternative — **a JSON column** (`{ "en": {...}, "fa-AF": {...} }`):

- The database cannot enforce that a key is a supported locale. The `Locale`
  enum exists precisely so an unsupported value is rejected at write time rather
  than discovered at render time.
- Listing courses in one language becomes a scan that unpacks every document,
  instead of an indexed join that touches only the rows needed.
- A missing translation becomes a missing JSON key — indistinguishable from a
  typo, and invisible until something renders blank.

Rejected alternative — **a column per locale** (`title_en`, `title_fa`, …): every
new locale is a migration on a growing table, and every query names all of them.

### Fallback is a read-path decision, not a schema one

The schema permits a course to have one translation, or three, or none. It does
not pretend otherwise, because content genuinely arrives that way.

`CourseService` resolves text against an ordered chain — requested locale, then
`fa-AF`, then `en` — and returns `textLocale` saying which one it actually used.

The client uses that field to label the card. **A reader is told the text is in
another language rather than being silently handed one.** Silently substituting
is the failure mode worth avoiding: a Pashto speaker shown unmarked Dari has no
way to tell whether the translation is missing or whether they misread.

Falling back to the slug is the last resort, so an untranslated course is still
navigable rather than a blank row.

## Consequences

- One extra join on catalogue reads. Cheap: it is indexed on `(locale)` and the
  page size is capped.
- Publishing a course in a new language is an insert, not a migration.
- Partial translation is a first-class state that the UI must handle, and now
  has data to handle it with — the seed deliberately leaves one course without
  Pashto so the path is exercised rather than assumed.
- The same pattern extends to lessons, assessments and certificates when those
  land. Do not invent a second content-translation mechanism for them.
- A future admin surface will need to show which locales a course is missing.
  The composite key makes that a `groupBy`, not a scan.
