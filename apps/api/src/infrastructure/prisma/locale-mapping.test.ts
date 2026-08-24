import { LOCALES } from '@afghan-it-academy/shared';
import { describe, expect, it } from 'vitest';

import { localeMappingIsConsistent, toDomainLocale, toStoredLocale } from './locale-mapping.js';

/**
 * The domain uses BCP 47 tags (`fa-AF`); Prisma's enum member is `fa_AF`
 * because a hyphen is not a valid identifier. A wrong mapping compiles fine and
 * fails at runtime as a Postgres enum violation, so it is pinned here.
 */
describe('locale mapping', () => {
  it('round-trips every supported locale', () => {
    expect(localeMappingIsConsistent()).toBe(true);
    for (const locale of LOCALES) {
      expect(toDomainLocale(toStoredLocale(locale))).toBe(locale);
    }
  });

  it('converts hyphenated tags to underscored enum members', () => {
    expect(toStoredLocale('fa-AF')).toBe('fa_AF');
    expect(toStoredLocale('ps-AF')).toBe('ps_AF');
    expect(toStoredLocale('en')).toBe('en');
  });

  it('converts enum members back to the tags clients receive', () => {
    expect(toDomainLocale('fa_AF')).toBe('fa-AF');
    expect(toDomainLocale('ps_AF')).toBe('ps-AF');
  });

  it('never returns an underscored value to the domain', () => {
    for (const stored of ['en', 'fa_AF', 'ps_AF'] as const) {
      expect(toDomainLocale(stored)).not.toContain('_');
    }
  });
});
