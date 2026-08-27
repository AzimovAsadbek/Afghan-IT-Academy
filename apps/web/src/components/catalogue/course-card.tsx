import type { CourseSummary } from '@afghan-it-academy/shared/catalogue';
import { LOCALE_METADATA, type Locale } from '@afghan-it-academy/shared/i18n';
import { Badge } from '@afghan-it-academy/ui';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

/**
 * One course in the catalogue listing.
 *
 * A Server Component, and the whole card is a single link. Wrapping the card
 * rather than putting a "View course" button inside it means the entire target
 * is tappable — which matters on a small phone far more than it does on a
 * desktop — and it ships no JavaScript to do it.
 */
export function CourseCard({ course, locale }: { course: CourseSummary; locale: Locale }) {
  const t = useTranslations('catalogue');

  const hours = Math.round(course.estimatedMinutes / 60);
  const isTranslated = course.textLocale === locale;

  return (
    <li>
      <Link
        href={`/courses/${course.slug}`}
        className="border-brand-100 hover:border-brand-300 focus-visible:outline-brand-600 flex h-full flex-col gap-3 rounded-[--radius-card] border bg-white p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{t(`subjects.${course.subject}`)}</Badge>
          <Badge tone="neutral">{t(`levels.${course.level}`)}</Badge>
          {!isTranslated && (
            /* The reader asked for one language and is getting another. Saying
               so is the difference between "this course has no Pashto yet" and
               "I must have misread the page". */
            <Badge tone="muted">
              {t('translation.short', {
                language: LOCALE_METADATA[course.textLocale as Locale].nativeName,
              })}
            </Badge>
          )}
        </div>

        <h2 className="text-ink-900 text-balance text-lg font-semibold">{course.title}</h2>

        {course.summary.length > 0 && (
          <p className="text-ink-700 text-pretty text-sm">{course.summary}</p>
        )}

        <p className="text-ink-700 mt-auto text-sm">{t('card.duration', { hours })}</p>
      </Link>
    </li>
  );
}
