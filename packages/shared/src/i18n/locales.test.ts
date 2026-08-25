import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
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
