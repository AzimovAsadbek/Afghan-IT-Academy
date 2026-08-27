import { isCourseLevel, isSubjectKey } from '@afghan-it-academy/shared/catalogue';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CatalogueFilters } from '@/components/catalogue/catalogue-filters';
import { CourseCard } from '@/components/catalogue/course-card';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { fetchCourses } from '@/lib/api/catalogue';

interface SearchParams {
  readonly subject?: string;
  readonly level?: string;
  readonly cursor?: string;
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'catalogue' });

  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: {
      canonical: `/${locale}/courses`,
      languages: Object.fromEntries(routing.locales.map((code) => [code, `/${code}/courses`])),
    },
    // Indexable: discovery is the point of this page, and a filtered view is
    // still a legitimate landing page for "English courses in Dari".
    robots: { index: true, follow: true },
  };
}

/**
 * The course catalogue.
 *
 * Rendered on the server and cached, rather than fetched from the browser. Two
 * reasons, and both matter more here than on the account pages: a learner on a
 * slow connection sees courses in the first response instead of after a
 * JavaScript bundle and a round trip, and a search engine indexing the
 * catalogue sees them at all.
 *
 * Nothing on this page is a client component. Filters and pagination are links,
 * so the entire route ships zero JavaScript of its own.
 */
export default async function CoursesPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // eslint-disable-next-line @typescript-eslint/no-deprecated -- see .claude/rules/i18n.md
  setRequestLocale(locale);

  const search = await props.searchParams;
  const t = await getTranslations('catalogue');

  // Validated before use: an unknown value is dropped rather than forwarded, so
  // a hand-edited URL cannot make the API reject the whole page.
  const subject = isSubjectKey(search.subject) ? search.subject : undefined;
  const level = isCourseLevel(search.level) ? search.level : undefined;

  const page = await fetchCourses({ locale, subject, level, cursor: search.cursor });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-ink-900 text-balance text-3xl font-bold">{t('title')}</h1>
        <p className="text-ink-700 text-pretty">{t('subtitle')}</p>
      </header>

      <CatalogueFilters active={{ subject, level }} />

      {page === null ? (
        <ErrorState heading={t('error.heading')} body={t('error.body')} />
      ) : page.items.length === 0 ? (
        <EmptyState heading={t('empty.heading')} body={t('empty.body')} />
      ) : (
        <section aria-labelledby="results-heading" className="flex flex-col gap-5">
          <h2 id="results-heading" className="text-ink-700 text-sm">
            {t('count', { count: page.items.length })}
          </h2>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {page.items.map((course) => (
              <CourseCard key={course.id} course={course} locale={locale} />
            ))}
          </ul>

          {page.nextCursor !== null && (
            <nav className="flex justify-center pt-2">
              <Link
                href={buildHref({ subject, level, cursor: page.nextCursor })}
                className="border-brand-200 text-brand-700 hover:bg-brand-50 focus-visible:outline-brand-600 inline-flex min-h-11 items-center rounded-lg border px-5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {t('pagination.next')}
              </Link>
            </nav>
          )}
        </section>
      )}
    </main>
  );
}

function buildHref(next: {
  subject?: string | undefined;
  level?: string | undefined;
  cursor?: string | undefined;
}): string {
  const params = new URLSearchParams();
  if (next.subject !== undefined) params.set('subject', next.subject);
  if (next.level !== undefined) params.set('level', next.level);
  if (next.cursor !== undefined) params.set('cursor', next.cursor);

  const query = params.toString();
  return query.length > 0 ? `/courses?${query}` : '/courses';
}

function EmptyState({ heading, body }: { readonly heading: string; readonly body: string }) {
  return (
    <div className="border-brand-100 rounded-[--radius-card] border border-dashed p-8 text-center">
      <p className="text-ink-900 font-semibold">{heading}</p>
      <p className="text-ink-700 mt-2 text-sm">{body}</p>
    </div>
  );
}

/**
 * Shown when the API could not be reached.
 *
 * `role="alert"` because the reader has navigated here expecting courses and is
 * instead being told something went wrong.
 */
function ErrorState({ heading, body }: { readonly heading: string; readonly body: string }) {
  return (
    <div
      role="alert"
      className="border-danger/40 bg-danger/5 rounded-[--radius-card] border p-6 text-center"
    >
      <p className="text-danger font-semibold">{heading}</p>
      <p className="text-ink-700 mt-2 text-sm">{body}</p>
    </div>
  );
}
