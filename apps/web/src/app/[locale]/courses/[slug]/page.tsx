import { LOCALE_METADATA, type Locale } from '@afghan-it-academy/shared/i18n';
import { Badge, Button } from '@afghan-it-academy/ui';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { fetchCourse } from '@/lib/api/catalogue';

interface RouteParams {
  readonly locale: string;
  readonly slug: string;
}

export async function generateMetadata(props: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { locale, slug } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};

  const course = await fetchCourse(slug, locale);
  if (!course) return { robots: { index: false, follow: false } };

  return {
    title: course.title,
    description: course.summary,
    alternates: {
      canonical: `/${locale}/courses/${slug}`,
      // The slug is not localised, so the same course has one URL per locale
      // and they differ only by prefix. That is what makes hreflang meaningful
      // here: three addresses, one piece of content.
      languages: Object.fromEntries(
        routing.locales.map((code) => [code, `/${code}/courses/${slug}`]),
      ),
    },
    openGraph: {
      type: 'article',
      title: course.title,
      description: course.summary,
      locale: LOCALE_METADATA[locale].htmlLang,
    },
    robots: { index: true, follow: true },
  };
}

/**
 * One course.
 *
 * Server-rendered and cached like the listing. This is the page a shared
 * WhatsApp link opens and the page a search engine indexes, so the content has
 * to be in the first response rather than behind a fetch.
 */
export default async function CoursePage(props: { params: Promise<RouteParams> }) {
  const { locale, slug } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // eslint-disable-next-line @typescript-eslint/no-deprecated -- see .claude/rules/i18n.md
  setRequestLocale(locale);

  const t = await getTranslations('catalogue');
  const course = await fetchCourse(slug, locale);

  // A draft, an archived-and-removed course and a typo are one outcome here,
  // exactly as they are in the API.
  if (!course) notFound();

  const hours = Math.round(course.estimatedMinutes / 60);
  const isTranslated = course.textLocale === locale;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-10">
      <nav>
        <Link href="/courses" className="text-brand-700 text-sm font-medium underline">
          {t('detail.back')}
        </Link>
      </nav>

      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{t(`subjects.${course.subject}`)}</Badge>
          <Badge tone="neutral">{t(`levels.${course.level}`)}</Badge>
        </div>

        <h1 className="text-ink-900 text-balance text-3xl font-bold">{course.title}</h1>

        {course.summary.length > 0 && (
          <p className="text-ink-700 text-pretty text-lg">{course.summary}</p>
        )}

        {!isTranslated && (
          /* Stated as a full sentence here rather than the card's short badge:
             on the page someone is about to commit study time to, "this is not
             in your language yet" deserves a sentence. */
          <p
            role="status"
            className="border-brand-100 bg-brand-50 text-ink-800 rounded-lg border px-4 py-2 text-sm"
          >
            {t('translation.notice', {
              language: LOCALE_METADATA[course.textLocale as Locale].nativeName,
            })}
          </p>
        )}
      </header>

      <dl className="border-brand-100 grid gap-4 rounded-[--radius-card] border p-4 sm:grid-cols-3">
        <Fact label={t('detail.subject')} value={t(`subjects.${course.subject}`)} />
        <Fact label={t('detail.level')} value={t(`levels.${course.level}`)} />
        <Fact label={t('detail.duration')} value={t('card.duration', { hours })} />
      </dl>

      {course.description.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-ink-900 text-xl font-semibold">{t('detail.about')}</h2>
          <p className="text-ink-800 text-pretty leading-relaxed">{course.description}</p>
        </section>
      )}

      <div className="flex flex-col gap-2">
        {/* Enrolment is the next milestone. A disabled control that says why is
            honest; a live button that fails, or a silent absence that leaves the
            page with no ending, is not. */}
        <Button size="lg" disabled>
          {t('detail.enrol')}
        </Button>
        <p className="text-ink-700 text-sm">{t('detail.enrolSoon')}</p>
      </div>
    </main>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-ink-700 text-xs font-medium uppercase tracking-wide">{label}</dt>
      <dd className="text-ink-900 font-medium">{value}</dd>
    </div>
  );
}
