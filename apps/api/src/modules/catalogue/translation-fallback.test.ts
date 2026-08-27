import { describe, expect, it } from 'vitest';

import { fallbackChain, pickTranslation } from './translation-fallback.js';

/** The shape `pickTranslation` cares about; the rest of a row is irrelevant. */
function translation(locale: 'en' | 'fa_AF' | 'ps_AF', title: string) {
  return { locale, title } as const;
}

describe('fallbackChain', () => {
  it('puts the requested locale first', () => {
    expect(fallbackChain('ps-AF')[0]).toBe('ps-AF');
    expect(fallbackChain('en')[0]).toBe('en');
  });

  it('falls back to Dari then English', () => {
    expect(fallbackChain('ps-AF')).toEqual(['ps-AF', 'fa-AF', 'en']);
  });

  it('never repeats the requested locale', () => {
    expect(fallbackChain('fa-AF')).toEqual(['fa-AF', 'en']);
    expect(fallbackChain('en')).toEqual(['en', 'fa-AF']);
  });

  it('covers every supported locale from any starting point', () => {
    for (const locale of ['en', 'fa-AF', 'ps-AF'] as const) {
      const chain = fallbackChain(locale);
      expect(new Set(chain).size, `duplicate entry for ${locale}`).toBe(chain.length);
    }
  });
});

describe('pickTranslation', () => {
  it('returns the requested locale when it exists', () => {
    const chosen = pickTranslation(
      [translation('en', 'English'), translation('ps_AF', 'Pashto')],
      fallbackChain('ps-AF'),
    );

    expect(chosen?.title).toBe('Pashto');
  });

  /** The case the seeded AI course exercises: Pashto asked for, Dari available. */
  it('falls back to Dari when the requested locale is missing', () => {
    const chosen = pickTranslation(
      [translation('en', 'English'), translation('fa_AF', 'Dari')],
      fallbackChain('ps-AF'),
    );

    expect(chosen?.title).toBe('Dari');
  });

  it('falls back to English when neither the request nor Dari exists', () => {
    const chosen = pickTranslation([translation('en', 'English')], fallbackChain('ps-AF'));

    expect(chosen?.title).toBe('English');
  });

  it('prefers the requested locale over an earlier entry in the array', () => {
    // Ordering of the rows must not decide the outcome; the chain must.
    const chosen = pickTranslation(
      [translation('fa_AF', 'Dari'), translation('en', 'English')],
      fallbackChain('en'),
    );

    expect(chosen?.title).toBe('English');
  });

  it('returns null when the course has no translations at all', () => {
    expect(pickTranslation([], fallbackChain('fa-AF'))).toBeNull();
  });

  /**
   * Cannot arise from the current chain, which already covers two of three
   * locales — but the guarantee is "something rather than a blank card", and
   * that should hold if the chain ever changes.
   */
  it('falls back to any available translation outside the chain', () => {
    const chosen = pickTranslation([translation('ps_AF', 'Pashto')], ['en', 'fa-AF'] as const);

    expect(chosen?.title).toBe('Pashto');
  });
});
