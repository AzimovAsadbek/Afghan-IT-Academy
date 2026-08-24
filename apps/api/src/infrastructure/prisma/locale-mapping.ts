import { LOCALES, isLocale, type Locale as DomainLocale } from '@afghan-it-academy/shared';

import type { Locale as StoredLocale } from '../../../generated/prisma/index.js';

/**
 * Translates between the domain's locale tags and Prisma's enum members.
 *
 * The two differ for a mundane reason: BCP 47 uses `fa-AF`, and a hyphen is not
 * a valid identifier, so the Prisma enum member is `fa_AF` and carries
 * `@map("fa-AF")`. The *column* holds the correct tag; only the generated
 * TypeScript member name differs.
 *
 * Mapping explicitly rather than casting, because a cast would compile happily
 * the day someone adds a locale to one side and not the other, and the failure
 * would surface as a runtime enum violation from Postgres.
 */

const DOMAIN_TO_STORED: Readonly<Record<DomainLocale, StoredLocale>> = {
  en: 'en',
  'fa-AF': 'fa_AF',
  'ps-AF': 'ps_AF',
};

const STORED_TO_DOMAIN: Readonly<Record<StoredLocale, DomainLocale>> = {
  en: 'en',
  fa_AF: 'fa-AF',
  ps_AF: 'ps-AF',
};

export function toStoredLocale(locale: DomainLocale): StoredLocale {
  return DOMAIN_TO_STORED[locale];
}

export function toDomainLocale(locale: StoredLocale): DomainLocale {
  return STORED_TO_DOMAIN[locale];
}

/**
 * Every domain locale has a stored counterpart and back again.
 *
 * Exported for the test rather than asserted here: the compiler already
 * requires both records to be exhaustive over their key type, so this guards the
 * remaining risk — a mapping that is total but wrong.
 */
export function localeMappingIsConsistent(): boolean {
  return LOCALES.every((locale) => {
    const roundTripped = toDomainLocale(toStoredLocale(locale));
    return isLocale(roundTripped) && roundTripped === locale;
  });
}
