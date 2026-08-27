import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  formatNumber,
  numberFormatOptions,
  LOCALES,
  LOCALE_METADATA,
  getDirection,
  isLocale,
  isRtl,
  resolveLocale,
} from './locales.js';

describe('locale metadata', () => {
  it('describes every supported locale', () => {
    for (const locale of LOCALES) {
      expect(LOCALE_METADATA[locale].code).toBe(locale);
    }
  });

  it('marks Dari and Pashto as RTL and English as LTR', () => {
    expect(getDirection('fa-AF')).toBe('rtl');
    expect(getDirection('ps-AF')).toBe('rtl');
    expect(getDirection('en')).toBe('ltr');
    expect(isRtl('fa-AF')).toBe(true);
    expect(isRtl('en')).toBe(false);
  });
});

describe('isLocale', () => {
  it.each(LOCALES)('accepts %s', (locale) => {
    expect(isLocale(locale)).toBe(true);
  });

  it.each([['fa'], ['ps'], ['en-US'], [''], ['../etc/passwd']])('rejects %s', (value) => {
    expect(isLocale(value)).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe('resolveLocale', () => {
  it('falls back to the default when the header is absent', () => {
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('')).toBe(DEFAULT_LOCALE);
  });

  it('matches an exact supported tag', () => {
    expect(resolveLocale('ps-AF')).toBe('ps-AF');
  });

  it('matches case-insensitively', () => {
    expect(resolveLocale('FA-af')).toBe('fa-AF');
  });

  it('falls back through the language subtag', () => {
    // An Iranian Persian browser should get Dari, not English.
    expect(resolveLocale('fa-IR,fa;q=0.9')).toBe('fa-AF');
  });

  /**
   * The header every real browser sends. A catalogue endpoint once matched the
   * first tag exactly and served Dari to every English speaker on the internet,
   * so these stay pinned.
   */
  it('resolves a regional English tag to English', () => {
    expect(resolveLocale('en-US,en;q=0.9')).toBe('en');
    expect(resolveLocale('en-GB')).toBe('en');
    expect(resolveLocale('en-US')).toBe('en');
  });

  it('honours quality values', () => {
    expect(resolveLocale('de;q=0.9,en;q=0.8')).toBe('en');
    expect(resolveLocale('en;q=0.2,ps-AF;q=0.9')).toBe('ps-AF');
  });

  it('ignores unsupported languages entirely', () => {
    expect(resolveLocale('de-DE,fr;q=0.5')).toBe(DEFAULT_LOCALE);
  });

  it('tolerates malformed quality values', () => {
    expect(resolveLocale('en;q=notanumber,ps-AF')).toBe('ps-AF');
  });
});

/**
 * These pin the digits a reader actually sees, and they exist because the
 * runtime cannot be trusted to agree: Node resolves `ps-AF` to `arabext`, while
 * Chrome ships no Pashto data at all, falls back to `en-US`, and renders Latin
 * digits. The same page server-rendered ۱۲ and hydrated to 12.
 */
describe('formatNumber', () => {
  it('renders Latin digits for English', () => {
    expect(formatNumber(15, 'en')).toBe('15');
  });

  it('renders Arabic-Indic digits for Dari', () => {
    expect(formatNumber(15, 'fa-AF')).toBe('۱۵');
  });

  it('renders Arabic-Indic digits for Pashto, whatever the runtime would default to', () => {
    expect(formatNumber(15, 'ps-AF')).toBe('۱۵');
  });

  it('agrees with the locale metadata rather than with the runtime', () => {
    for (const locale of LOCALES) {
      expect(numberFormatOptions(locale).numberingSystem).toBe(
        LOCALE_METADATA[locale].numberingSystem,
      );
    }
  });

  /**
   * The mechanism matters. The `-u-nu-` extension is the more obvious fix and
   * the wrong one: Chrome drops it for a locale it has no data for, so it would
   * pass here and fail in the browser. Only the explicit option survives.
   */
  it('pins the numbering system as an option, not as a locale extension', () => {
    const options = numberFormatOptions('ps-AF');
    expect(options.numberingSystem).toBe('arabext');
    expect(new Intl.NumberFormat('ps-AF', options).format(0)).toBe('۰');
  });
});
