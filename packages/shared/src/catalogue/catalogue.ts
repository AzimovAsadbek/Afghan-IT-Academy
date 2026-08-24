/**
 * Catalogue vocabulary shared by the API and the web app.
 *
 * These are controlled values the product defines, not author-written content.
 * Their display names live in `messages/{locale}.json` alongside the rest of the
 * interface copy — the same treatment role and permission names get.
 *
 * Course titles and descriptions are the opposite case: written by people, one
 * row per locale in the database. See ADR 0008 for why the two are handled
 * differently.
 *
 * This module imports nothing, so the web app can use it without pulling Zod
 * into a client bundle.
 */

/** Top-level areas of study. Keys are contract: they key the DB rows and the translations. */
export const SUBJECTS = {
  IT: 'IT',
  ENGLISH: 'ENGLISH',
  AI: 'AI',
} as const;

export type SubjectKey = (typeof SUBJECTS)[keyof typeof SUBJECTS];

export const ALL_SUBJECTS: readonly SubjectKey[] = Object.values(SUBJECTS);

export function isSubjectKey(value: unknown): value is SubjectKey {
  return typeof value === 'string' && (ALL_SUBJECTS as readonly string[]).includes(value);
}

export const COURSE_LEVELS = {
  BEGINNER: 'BEGINNER',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
} as const;

export type CourseLevel = (typeof COURSE_LEVELS)[keyof typeof COURSE_LEVELS];

export const ALL_COURSE_LEVELS: readonly CourseLevel[] = Object.values(COURSE_LEVELS);

export function isCourseLevel(value: unknown): value is CourseLevel {
  return typeof value === 'string' && (ALL_COURSE_LEVELS as readonly string[]).includes(value);
}

/**
 * Publication states.
 *
 * Exposed to the client because an instructor's own course list needs to show
 * them. A learner only ever sees PUBLISHED, and that is enforced server-side —
 * this type is not a filter.
 */
export const COURSE_STATUSES = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type CourseStatus = (typeof COURSE_STATUSES)[keyof typeof COURSE_STATUSES];

/** A course as it appears in a catalogue listing. */
export interface CourseSummary {
  readonly id: string;
  readonly slug: string;
  readonly subject: SubjectKey;
  readonly level: CourseLevel;
  readonly estimatedMinutes: number;
  readonly publishedAt: string | null;
  readonly title: string;
  readonly summary: string;
  /**
   * The locale the text above is actually in.
   *
   * Not always the locale that was requested: a course may not be translated
   * yet, in which case the API falls back rather than showing an empty card.
   * The client uses this to mark the card, so a Pashto reader is told the text
   * is in Dari instead of quietly being shown another language.
   */
  readonly textLocale: string;
}

/** A course as it appears on its own page. */
export interface CourseDetail extends CourseSummary {
  readonly description: string;
}
