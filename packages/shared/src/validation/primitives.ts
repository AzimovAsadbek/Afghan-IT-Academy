import { z } from 'zod';

import { LOCALES } from '../i18n/locales.js';

/**
 * Validation primitives shared between the API (request DTOs) and the web app
 * (form schemas), so a rule is defined once and cannot drift between the two.
 */

export const localeSchema = z.enum(LOCALES);

/** CUID2 — what Prisma generates for entity identifiers. */
export const idSchema = z
  .string()
  .min(24)
  .max(32)
  .regex(/^[a-z0-9]+$/, 'invalid_id');

export const emailSchema = z.email('invalid_email').trim().toLowerCase().min(3).max(254);

/**
 * Password policy.
 *
 * Length is the dominant factor in real-world resistance, so the floor is 12
 * rather than an 8-character rule padded with symbol requirements that mostly
 * produce `Password1!`. The upper bound guards against DoS via slow hashing of
 * megabyte-sized inputs.
 */
export const passwordSchema = z
  .string()
  .min(12, 'too_short')
  .max(128, 'too_long')
  .refine((value) => !/^\s|\s$/.test(value), 'leading_or_trailing_whitespace');

/** Cursor pagination: stable under concurrent inserts, unlike offset paging. */
export const paginationSchema = z.object({
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export interface Paginated<T> {
  readonly items: readonly T[];
  /** Cursor for the next page, or null when the list is exhausted. */
  readonly nextCursor: string | null;
}

/** Human-readable slug used in localised URLs. */
export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'invalid_slug');
