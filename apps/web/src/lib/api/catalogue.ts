import type { CourseDetail, CourseSummary } from '@afghan-it-academy/shared/catalogue';
import type { Locale } from '@afghan-it-academy/shared/i18n';

import { API_BASE_URL } from './base-url';

/**
 * Catalogue reads, performed on the server.
 *
 * Separate from `client.ts` on purpose. That module exists for the browser: it
 * attaches cookie credentials and turns failures into a translated `ApiError`.
 * The catalogue is public, is rendered on the server, and must not send a
 * credential — forwarding the session cookie here would mean a shared render
 * cache could hold one learner's view of the catalogue.
 *
 * Rendering on the server rather than fetching from the browser is the whole
 * point for this route: the HTML arrives already containing the courses, so a
 * learner on a slow connection sees content without waiting for a JavaScript
 * bundle, and a search engine indexing course pages sees it too.
 */

export interface CoursePage {
  readonly items: readonly CourseSummary[];
  readonly nextCursor: string | null;
}

export interface CatalogueQuery {
  readonly locale: Locale;
  readonly subject?: string | undefined;
  readonly level?: string | undefined;
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
}

/**
 * How long a rendered catalogue page may be reused.
 *
 * Five minutes. Course content changes when someone publishes a course, which
 * is a rare, deliberate act — not something worth a database round trip on
 * every request from every visitor. The cost of being briefly stale is that a
 * newly published course appears a few minutes late; the cost of not caching is
 * paid by every learner on a metered connection.
 */
const REVALIDATE_SECONDS = 300;

async function readCatalogue<T>(path: string, locale: Locale): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      // The API picks the course language from this. It is the server's job to
      // pass the route's locale through, not the browser's.
      headers: { 'accept-language': locale },
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!response.ok) return null;

    return (await response.json()) as T;
  } catch {
    // A render must not throw because the API is briefly unreachable. The
    // caller turns null into a visible, translated message; an unhandled
    // rejection here would produce a 500 and no explanation at all.
    return null;
  }
}

export function fetchCourses(query: CatalogueQuery): Promise<CoursePage | null> {
  const params = new URLSearchParams();
  if (query.subject !== undefined) params.set('subject', query.subject);
  if (query.level !== undefined) params.set('level', query.level);
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  params.set('limit', String(query.limit ?? 12));

  return readCatalogue<CoursePage>(`/v1/courses?${params.toString()}`, query.locale);
}

export function fetchCourse(slug: string, locale: Locale): Promise<CourseDetail | null> {
  return readCatalogue<CourseDetail>(`/v1/courses/${encodeURIComponent(slug)}`, locale);
}
