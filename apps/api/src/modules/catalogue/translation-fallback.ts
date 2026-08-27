import { DEFAULT_LOCALE, type Locale as DomainLocale } from '@afghan-it-academy/shared';

import type { Locale as StoredLocale } from '../../../generated/prisma/index.js';
import { toDomainLocale } from '../../infrastructure/prisma/index.js';

/**
 * Choosing which language a piece of authored content is shown in.
 *
 * Extracted from `CourseService` so it can be tested directly. These are the
 * rules that decide what a reader actually sees when a translation is missing,
 * and testing them only through an HTTP round trip against seed data means the
 * awkward cases — no translations at all, a locale that exists but is not
 * requested — are never exercised.
 *
 * Pure: no database, no request, no clock.
 */

/** A locale preference order that is guaranteed to have a first entry. */
export type FallbackChain = readonly [DomainLocale, ...DomainLocale[]];

/**
 * Ordered preference for a course's text.
 *
 * The requested locale first, then Dari, then English. Dari before English
 * because it is the default locale and the larger audience; English last
 * because it is the translation most likely to exist at all.
 *
 * Never contains a duplicate, so a caller asking for Dari does not check it
 * twice.
 */
export function fallbackChain(locale: DomainLocale): FallbackChain {
  const chain: [DomainLocale, ...DomainLocale[]] = [locale];

  for (const candidate of [DEFAULT_LOCALE, 'en'] as const) {
    if (!chain.includes(candidate)) chain.push(candidate);
  }

  return chain;
}

/**
 * The first translation available in preference order.
 *
 * Falls back past the chain to *any* translation the course has, rather than
 * returning nothing: a course translated only into a language outside the chain
 * cannot happen today — the chain covers two of three locales and the third is
 * only ever the requested one — but returning a title in an unexpected language
 * still beats returning a blank card, and the caller reports which locale it
 * got either way.
 *
 * @returns null only when the course has no translations at all.
 */
export function pickTranslation<T extends { readonly locale: StoredLocale }>(
  translations: readonly T[],
  wanted: FallbackChain,
): T | null {
  for (const locale of wanted) {
    const match = translations.find((translation) => toDomainLocale(translation.locale) === locale);
    if (match) return match;
  }

  return translations[0] ?? null;
}
