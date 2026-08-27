import { Button } from '@afghan-it-academy/ui';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { Link } from '@/i18n/navigation';

/**
 * Foundation landing page.
 *
 * This is the platform skeleton, not the final marketing homepage: it exists to
 * prove locale routing, RTL mirroring, translated content and the design tokens
 * all work end to end. The approved homepage design lands with the catalogue
 * milestone.
 */
export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  // next-intl 4.13 deprecates this in favour of next/root-params, but its
  // static-rendering path still depends on it. Upgrade trigger is recorded in
  // .claude/rules/i18n.md.
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- see .claude/rules/i18n.md
  setRequestLocale(locale);

  const t = useTranslations('home');

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex items-center justify-between gap-4">
        <span className="text-ink-900 text-lg font-bold">{t('eyebrow')}</span>
        <LocaleSwitcher />
      </header>

      <section className="flex flex-col gap-5">
        <h1 className="text-ink-900 text-balance text-4xl font-bold leading-tight">
          {t('headline')}
        </h1>
        <p className="text-ink-700 text-pretty text-lg">{t('subheadline')}</p>

        <div className="flex flex-wrap gap-3">
          {/* The catalogue is the product's front door; the homepage button
              that names it should actually open it. */}
          <Link
            href="/courses"
            className="bg-brand-600 hover:bg-brand-700 active:bg-brand-800 focus-visible:outline-brand-600 h-13 inline-flex items-center justify-center rounded-lg px-7 text-lg font-medium text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t('primaryCta')}
          </Link>
          <Button size="lg" variant="secondary">
            {t('secondaryCta')}
          </Button>
        </div>
      </section>

      <section
        aria-labelledby="status-heading"
        className="border-brand-100 bg-brand-50/60 rounded-[--radius-card] border p-6"
      >
        <h2 id="status-heading" className="text-brand-800 text-sm font-semibold tracking-wide">
          {t('status.heading')}
        </h2>
        <p className="text-ink-900 mt-2 text-xl font-semibold">{t('status.foundation')}</p>
        <p className="text-ink-700 mt-2">{t('status.description')}</p>
      </section>
    </main>
  );
}
