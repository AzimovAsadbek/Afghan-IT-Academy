# Multilingual UI and accessibility

## Direction

`dir` is set once, on `<html>`, from the active locale. No component decides its
own direction.

**Use logical properties. Always.**

| Never                      | Always                    |
| -------------------------- | ------------------------- |
| `ml-4` / `mr-4`            | `ms-4` / `me-4`           |
| `pl-4` / `pr-4`            | `ps-4` / `pe-4`           |
| `left-0` / `right-0`       | `start-0` / `end-0`       |
| `text-left` / `text-right` | `text-start` / `text-end` |
| `border-l` / `border-r`    | `border-s` / `border-e`   |

An ESLint rule rejects physical utilities inside `className`, so RTL breakage
fails the build instead of reaching a Dari-reading user.

Icons that encode direction — back arrows, progress chevrons — must mirror.
Icons that do not — play, download, checkmark — must not.

## Typography

Arabic script needs more vertical room than Latin, so `--leading-arabic: 1.85`
is applied to RTL documents. Do not override line height per component without
checking Dari and Pashto.

Numerals: `LOCALE_METADATA[locale].numberingSystem` is `arabext` for Dari and
Pashto. Format numbers and dates with `Intl`, never by string concatenation.

## Text

- No user-facing string literals in components. Everything comes from
  `apps/web/messages/{locale}.json`.
- Translated strings are not predictably shorter or longer — never size a
  container to fit the English string.
- The API returns error codes; the client owns the wording.

## Accessibility

Not optional, and not a late pass.

- Every page starts with a skip link, positioned with logical properties so it
  lands on the correct side in RTL.
- Visible, high-contrast `:focus-visible` ring. Never remove the outline.
- Touch targets at least 44px at default size — the audience is on small,
  low-end phones.
- `prefers-reduced-motion` is honoured globally. It is also a battery and CPU
  saving on those devices.
- `jsx-a11y` rules run as errors, not warnings.
- Buttons default to `type="button"`; an unset type inside a form submits it.
- A loading button is disabled and `aria-busy` — on a slow connection a
  double-tap would otherwise fire the action twice.

## Checking a change

1. Read the page in `fa-AF` and confirm the layout mirrors.
2. Tab through it: focus order must follow reading order.
3. Confirm no English leaked into a translated view.
4. Check it at 320px width.
