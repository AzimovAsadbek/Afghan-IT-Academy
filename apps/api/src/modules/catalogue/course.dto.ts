import { isCourseLevel, isSubjectKey, paginationSchema } from '@afghan-it-academy/shared';
import { z } from 'zod';

/**
 * Query contract for the catalogue listing.
 *
 * Built on the shared `paginationSchema` so the cursor rules are the same here
 * as everywhere else, and `.strict()` for the same reason every other schema is:
 * an unrecognised filter should be an error, not a silently ignored parameter
 * that makes a caller think they narrowed a result set when they did not.
 */
export const courseListQuerySchema = paginationSchema
  .extend({
    subject: z.string().refine(isSubjectKey, 'unknown_subject').optional(),
    level: z.string().refine(isCourseLevel, 'unknown_level').optional(),
  })
  .strict();

export type CourseListQueryInput = z.infer<typeof courseListQuerySchema>;

/**
 * A course slug from the URL.
 *
 * Validated rather than passed straight to Prisma: the value reaches an indexed
 * lookup, and an unbounded string is a needless way to let a caller push
 * arbitrary length into a query.
 */
export const courseSlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'invalid_slug');
