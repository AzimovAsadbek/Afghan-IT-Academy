'use client';

import { LOCALES, LOCALE_METADATA, type Locale } from '@afghan-it-academy/shared/i18n';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { usePathname, useRouter } from '@/i18n/navigation';

/**
 * Language switcher.
 *
 * A plain `<select>` rather than a custom dropdown: it is keyboard and
 * screen-reader correct for free, renders with the platform's own RTL handling,
 * and ships no JavaScript beyond the change handler — which matters when the
 * page is loading over 2G.
 */
export function LocaleSwitcher() {
  const t = useTranslations('common');
  const activeLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function onChange(nextLocale: Locale) {
    startTransition(() => {
      // `pathname` here is the locale-stripped route, so the same page is kept
      // when the language changes instead of bouncing the user to the homepage.
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">{t('changeLanguage')}</span>
      <select
        value={activeLocale}
        disabled={isPending}
        onChange={(event) => {
          onChange(event.target.value as Locale);
        }}
        className="border-ink-700/20 focus-visible:outline-brand-600 rounded-md border bg-white px-3 py-2 focus-visible:outline-2"
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {LOCALE_METADATA[locale].nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
