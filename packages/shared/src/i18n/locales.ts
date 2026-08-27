/**
 * Locale definitions — the single source of truth for the whole platform.
 *
 * Both the web app (routing, `dir`, font selection) and the API (content
 * negotiation, localised email, stored content variants) import from here, so
 * adding a locale is a one-file change instead of a grep-and-pray exercise.
 */

/** BCP 47 tags. Region subtags are intentional: Afghan Persian and Afghan
 *  Pashto differ in vocabulary and numerals from the Iranian/Pakistani variants. */
export const LOCALES = ['en', 'fa-AF', 'ps-AF'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'fa-AF';

export type TextDirection = 'ltr' | 'rtl';

interface LocaleMetadata {
  /** BCP 47 tag, identical to the key. */
  readonly code: Locale;
  /** Name in the language itself — what a speaker expects to see in a switcher. */
  readonly nativeName: string;
  /** Name in English, for admin tooling and logs. */
  readonly englishName: string;
  readonly direction: TextDirection;
  /** `lang` attribute value for HTML. */
  readonly htmlLang: string;
  /** Numbering system used for dates and quantities in normal prose. */
  readonly numberingSystem: 'latn' | 'arabext';
}

export const LOCALE_METADATA: Readonly<Record<Locale, LocaleMetadata>> = {
  en: {
    code: 'en',
    nativeName: 'English',
    englishName: 'English',
    direction: 'ltr',
    htmlLang: 'en',
    numberingSystem: 'latn',
  },
  'fa-AF': {
    code: 'fa-AF',
    nativeName: 'دری',
    englishName: 'Dari',
    direction: 'rtl',
    htmlLang: 'fa-AF',
    numberingSystem: 'arabext',
  },
  'ps-AF': {
    code: 'ps-AF',
    nativeName: 'پښتو',
    englishName: 'Pashto',
    direction: 'rtl',
    htmlLang: 'ps-AF',
    numberingSystem: 'arabext',
  },
} as const;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function getDirection(locale: Locale): TextDirection {
  return LOCALE_METADATA[locale].direction;
}

export function isRtl(locale: Locale): boolean {
  return getDirection(locale) === 'rtl';
}

/**
 * Resolve a browser `Accept-Language` header to a supported locale.
 *
 * Falls back through the tag hierarchy (`fa-IR` -> `fa` -> `fa-AF`) so an
 * Iranian Persian browser still lands on Dari rather than English.
 */
export function resolveLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const quality = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isNaN(quality) ? 0 : quality };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const exact = LOCALES.find((locale) => locale.toLowerCase() === tag);
    if (exact) return exact;

    // Match on the primary language subtag: `fa-IR` and `fa` both mean Dari here.
    const primary = tag.split('-')[0];
    if (primary === undefined) continue;
    const byPrimary = LOCALES.find((locale) => locale.split('-')[0] === primary);
    if (byPrimary) return byPrimary;
  }

  return DEFAULT_LOCALE;
}

/**
 * Number formatting options that do not depend on the runtime's locale data.
 *
 * `new Intl.NumberFormat('ps-AF')` does not agree across environments, and the
 * disagreement is not subtle: Node's ICU resolves it to `arabext` and renders
 * ۱۵, while Chrome ships **no Pashto locale data at all** — `supportedLocalesOf`
 * returns an empty array — falls back to `en-US`, and renders 15. The same page
 * server-rendered ۱۲ and then hydrated to 12.
 *
 * Pinning the numbering system from LOCALE_METADATA removes the dependency on
 * whichever CLDR data a runtime happens to carry. The explicit *option* is the
 * mechanism that works: the `-u-nu-arabext` extension in the tag is silently
 * dropped by Chrome for a locale it has no data for, which makes it the more
 * obvious fix and the wrong one.
 *
 * This does not repair everything Chrome's missing Pashto data breaks — month
 * names in a Pashto date still come out in English, because there is no `ps`
 * month-name data to fall back on. Digits are what this fixes.
 */
export function numberFormatOptions(locale: Locale): Intl.NumberFormatOptions {
  return { numberingSystem: LOCALE_METADATA[locale].numberingSystem };
}

/**
 * Formats a number for display in a locale, deterministically.
 *
 * Use this rather than an ICU `{value, number}` placeholder or a plural's `#`:
 * both are formatted by the runtime's own `Intl.NumberFormat`, which is exactly
 * the thing that disagrees. Pass the result into the message as a string.
 */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, numberFormatOptions(locale)).format(value);
}
