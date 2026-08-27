import { ALL_COURSE_LEVELS, ALL_SUBJECTS } from '@afghan-it-academy/shared/catalogue';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

export interface ActiveFilters {
  readonly subject?: string | undefined;
  readonly level?: string | undefined;
}

/**
 * Subject and level filters, rendered as links.
 *
 * Links rather than a client-side form, deliberately. The filter state belongs
 * in the URL anyway — so a filtered catalogue can be shared, bookmarked and
 * indexed — and once it is there, a `<Link>` expresses the whole interaction
 * with no state, no effect and no JavaScript shipped to a metered connection.
 *
 * The cursor is dropped from every filter link on purpose: a cursor from the
 * previous result set means nothing in a new one, and carrying it over would
 * open a filtered catalogue somewhere in its middle.
 */
export function CatalogueFilters({ active }: { active: ActiveFilters }) {
  const t = useTranslations('catalogue');

  const hasFilters = active.subject !== undefined || active.level !== undefined;

  function href(next: ActiveFilters): string {
    const params = new URLSearchParams();
    if (next.subject !== undefined) params.set('subject', next.subject);
    if (next.level !== undefined) params.set('level', next.level);

    const query = params.toString();
    return query.length > 0 ? `/courses?${query}` : '/courses';
  }

  return (
    <section aria-labelledby="filters-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="filters-heading" className="text-ink-900 text-sm font-semibold">
          {t('filters.heading')}
        </h2>
        {hasFilters && (
          <Link href="/courses" className="text-brand-700 text-sm font-medium underline">
            {t('filters.clear')}
          </Link>
        )}
      </div>

      <FilterRow
        label={t('filters.subject')}
        allLabel={t('filters.all')}
        allHref={href({ level: active.level })}
        isAllActive={active.subject === undefined}
        options={ALL_SUBJECTS.map((subject) => ({
          key: subject,
          label: t(`subjects.${subject}`),
          href: href({ subject, level: active.level }),
          isActive: active.subject === subject,
        }))}
      />

      <FilterRow
        label={t('filters.level')}
        allLabel={t('filters.all')}
        allHref={href({ subject: active.subject })}
        isAllActive={active.level === undefined}
        options={ALL_COURSE_LEVELS.map((level) => ({
          key: level,
          label: t(`levels.${level}`),
          href: href({ subject: active.subject, level }),
          isActive: active.level === level,
        }))}
      />
    </section>
  );
}

interface FilterOption {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly isActive: boolean;
}

function FilterRow({
  label,
  allLabel,
  allHref,
  isAllActive,
  options,
}: {
  readonly label: string;
  readonly allLabel: string;
  readonly allHref: string;
  readonly isAllActive: boolean;
  readonly options: readonly FilterOption[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-ink-700 text-xs font-medium uppercase tracking-wide">{label}</h3>

      {/* A list, so a screen reader announces how many choices there are before
          reading them out. */}
      <ul className="flex flex-wrap gap-2">
        <FilterChip href={allHref} label={allLabel} isActive={isAllActive} />
        {options.map((option) => (
          <FilterChip
            key={option.key}
            href={option.href}
            label={option.label}
            isActive={option.isActive}
          />
        ))}
      </ul>
    </div>
  );
}

function FilterChip({
  href,
  label,
  isActive,
}: {
  readonly href: string;
  readonly label: string;
  readonly isActive: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        // The selected filter is announced, not only coloured — colour alone
        // does not reach a screen reader, and does not survive a high-contrast
        // theme either.
        aria-current={isActive ? 'true' : undefined}
        className={
          isActive
            ? 'bg-brand-600 focus-visible:outline-brand-600 inline-flex min-h-11 items-center rounded-full border border-transparent px-4 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2'
            : 'border-brand-100 text-ink-800 hover:bg-brand-50 focus-visible:outline-brand-600 inline-flex min-h-11 items-center rounded-full border bg-white px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2'
        }
      >
        {label}
      </Link>
    </li>
  );
}
