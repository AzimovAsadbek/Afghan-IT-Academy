import type {
  CourseDetail,
  CourseLevel,
  CourseSummary,
  Locale as DomainLocale,
  SubjectKey,
} from '@afghan-it-academy/shared';
import { Injectable } from '@nestjs/common';

import type { Locale as StoredLocale, Prisma } from '../../../generated/prisma/index.js';
import {
  PrismaService,
  toDomainLocale,
  toStoredLocale,
} from '../../infrastructure/prisma/index.js';
import { fallbackChain, pickTranslation, type FallbackChain } from './translation-fallback.js';

export interface CourseListQuery {
  readonly locale: DomainLocale;
  readonly subject?: SubjectKey;
  readonly level?: CourseLevel;
  readonly cursor?: string;
  readonly limit: number;
  /**
   * Whether the caller may see courses that are not published.
   *
   * Passed in rather than read from a request here: the service does not know
   * about HTTP, and the decision belongs to the guard that already resolved the
   * actor's permissions.
   */
  readonly includeUnpublished: boolean;
}

export interface CoursePage {
  readonly items: readonly CourseSummary[];
  readonly nextCursor: string | null;
}

/**
 * The catalogue read model.
 *
 * ## Why translations are fetched for more than one locale
 *
 * Course text is written by people, and Pashto routinely lands after Dari. A
 * query that selected only the requested locale would return a card with an
 * empty title — which looks like a bug and is worse than showing the text in a
 * language the reader may still understand.
 *
 * So each query selects the requested locale plus the fallback chain, and picks
 * per course. The response says which locale the text is actually in, so the
 * client can label it rather than silently swapping languages.
 */
@Injectable()
export class CourseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Which courses this caller may see in a listing.
   *
   * A learner sees PUBLISHED only. A holder of `course:view_unpublished` also
   * sees DRAFT and IN_REVIEW — the states that are on their way to being
   * offered.
   *
   * **ARCHIVED is excluded from listings for everyone**, including staff. It
   * stays reachable by direct slug so a link in an old certificate or a shared
   * message keeps resolving, but it is not on offer and does not belong in a
   * catalogue.
   *
   * The consequence is deliberate but incomplete: nobody can *find* an archived
   * course through this API without already knowing its slug. That is a real
   * gap for whoever eventually has to un-archive one — and it belongs to the
   * instructor platform, which needs its own listing with its own filters
   * anyway. Adding a status filter to the public catalogue to serve an
   * administrative need would put content management in the discovery endpoint,
   * which is the wrong shape. Revisit when that platform lands, not before.
   */
  private statusFilter(includeUnpublished: boolean): Prisma.CourseWhereInput {
    return includeUnpublished ? { status: { not: 'ARCHIVED' } } : { status: 'PUBLISHED' };
  }

  async list(query: CourseListQuery): Promise<CoursePage> {
    const wanted = fallbackChain(query.locale);

    const where: Prisma.CourseWhereInput = {
      ...this.statusFilter(query.includeUnpublished),
      ...(query.subject ? { subject: { key: query.subject } } : {}),
      ...(query.level ? { level: query.level } : {}),
    };

    // One extra row tells us whether another page exists without a second
    // COUNT query over the whole table.
    const rows = await this.prisma.course.findMany({
      where,
      // publishedAt first so the newest offering leads; id breaks ties so the
      // order is total and the cursor cannot skip or repeat a row.
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: this.summarySelect(wanted),
    });

    const page = rows.slice(0, query.limit);
    const nextCursor = rows.length > query.limit ? (page.at(-1)?.id ?? null) : null;

    return {
      items: page.map((row) => this.toSummary(row, wanted)),
      nextCursor,
    };
  }

  async findBySlug(
    slug: string,
    locale: DomainLocale,
    includeUnpublished: boolean,
  ): Promise<CourseDetail | null> {
    const wanted = fallbackChain(locale);

    const row = await this.prisma.course.findFirst({
      where: {
        slug,
        // An archived course stays reachable by slug so a link in an old
        // certificate or a shared message does not break.
        ...(includeUnpublished ? {} : { status: { in: ['PUBLISHED', 'ARCHIVED'] } }),
      },
      select: {
        ...this.summarySelect(wanted),
        translations: {
          where: { locale: { in: wanted.map(toStoredLocale) } },
          select: { locale: true, title: true, summary: true, description: true },
        },
      },
    });

    if (!row) return null;

    const summary = this.toSummary(row, wanted);
    const chosen = pickTranslation(row.translations, wanted);

    return { ...summary, description: chosen?.description ?? '' };
  }

  private summarySelect(wanted: FallbackChain) {
    return {
      id: true,
      slug: true,
      level: true,
      estimatedMinutes: true,
      publishedAt: true,
      subject: { select: { key: true } },
      translations: {
        where: { locale: { in: wanted.map(toStoredLocale) } },
        select: { locale: true, title: true, summary: true },
      },
    } satisfies Prisma.CourseSelect;
  }

  private toSummary(
    row: {
      id: string;
      slug: string;
      level: string;
      estimatedMinutes: number;
      publishedAt: Date | null;
      subject: { key: string };
      translations: readonly { locale: StoredLocale; title: string; summary: string }[];
    },
    wanted: FallbackChain,
  ): CourseSummary {
    const chosen = pickTranslation(row.translations, wanted);

    return {
      id: row.id,
      slug: row.slug,
      subject: row.subject.key as SubjectKey,
      level: row.level as CourseLevel,
      estimatedMinutes: row.estimatedMinutes,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      // An untranslated course still renders — as its slug, which is at least
      // navigable — rather than as an empty card.
      title: chosen?.title ?? row.slug,
      summary: chosen?.summary ?? '',
      textLocale: chosen ? toDomainLocale(chosen.locale) : wanted[0],
    };
  }
}
