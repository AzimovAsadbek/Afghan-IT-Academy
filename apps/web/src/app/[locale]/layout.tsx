import { LOCALE_METADATA, getDirection, type Locale } from '@afghan-it-academy/shared';
import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { QueryProvider } from '@/components/providers/query-provider';
import { arabicFont, latinFont } from '@/lib/fonts';
import { routing } from '@/i18n/routing';

import '../globals.css';

/**
 * Pre-renders one route tree per locale at build time instead of resolving the
 * locale on every request.
 */
export function generateStaticParams(): { locale: Locale }[] {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const t = await getTranslations({ locale, namespace: 'metadata' });

  return {
    title: { default: t('title'), template: `%s — ${t('siteName')}` },
    description: t('description'),
    // Tells search engines this page exists in three languages, so a Dari
    // speaker searching in Dari is served the Dari URL.
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(
        routing.locales.map((code) => [LOCALE_METADATA[code].htmlLang, `/${code}`]),
      ),
    },
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout(props: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;

  // Guard before the value reaches anything that trusts it.
  if (!hasLocale(routing.locales, locale)) notFound();

  // Required for static rendering: without it every page falls back to dynamic.
  // next-intl 4.13 deprecates this in favour of next/root-params, but its
  // static-rendering path still depends on it. Upgrade trigger is recorded in
  // .claude/rules/i18n.md.
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- see .claude/rules/i18n.md
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'common' });
  const direction = getDirection(locale);

  return (
    <html
      lang={LOCALE_METADATA[locale].htmlLang}
      dir={direction}
      className={`${latinFont.variable} ${arabicFont.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        {/* First focusable element on the page: lets keyboard and screen-reader
            users bypass the navigation. Positioned with logical properties so it
            appears on the correct side in RTL. */}
        <a href="#main-content" className="skip-link bg-brand-600 rounded px-4 py-2 text-white">
          {t('skipToContent')}
        </a>

        <NextIntlClientProvider>
          <QueryProvider>
            <div id="main-content">{props.children}</div>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
