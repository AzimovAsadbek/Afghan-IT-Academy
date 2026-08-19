import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { routing } from './routing';

/** Shape of a compiled message catalogue. */
type Messages = Record<string, unknown>;

async function loadMessages(locale: string): Promise<Messages> {
  const catalogue = (await import(`../../messages/${locale}.json`)) as { default: Messages };
  return catalogue.default;
}

/**
 * Per-request i18n configuration.
 *
 * Message catalogues are imported dynamically so a visitor downloads only the
 * language they are reading. Shipping all three would roughly triple the
 * translation payload for no benefit.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated -- see .claude/rules/i18n.md
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  // `hasLocale` is a validated narrowing: an unsupported segment must never be
  // used to build an import path.
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
    // Afghanistan uses a single offset year-round, so times render consistently
    // regardless of where the server runs.
    timeZone: 'Asia/Kabul',
    now: new Date(),
  };
});
