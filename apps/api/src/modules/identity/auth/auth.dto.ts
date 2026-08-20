import { emailSchema, localeSchema, passwordSchema } from '@afghan-it-academy/shared';
import { z } from 'zod';

/**
 * Request contracts for the authentication endpoints.
 *
 * Built from the shared primitives so the web app validates against exactly the
 * same rules — a client-side password policy that disagrees with the server's
 * produces a form that accepts input the API then rejects.
 *
 * Every schema is `.strict()`: an unexpected key is an error rather than being
 * silently dropped. Quietly ignoring `{ "role": "ADMIN" }` hides both client
 * bugs and probing.
 */

/** Long enough for real names, short enough not to be a storage vector. */
const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'too_short')
  .max(80, 'too_long')
  // Control characters would corrupt log lines and email headers. Expressed
  // as the Unicode 'Other, control' property rather than a literal range, so
  // the source contains no control characters of its own.
  .refine((value) => !/\p{Cc}/u.test(value), 'invalid_characters');

/** The opaque one-time token from a verification or reset link. */
const oneTimeTokenSchema = z
  .string()
  .min(20, 'invalid_token')
  .max(128, 'invalid_token')
  .regex(/^[A-Za-z0-9_-]+$/, 'invalid_token');

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: displayNameSchema,
    preferredLocale: localeSchema,
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({
    email: emailSchema,
    // Not passwordSchema: an existing password may predate a policy change, and
    // rejecting it at the login boundary would lock the owner out of the account
    // they are trying to reach in order to change it.
    password: z.string().min(1, 'required').max(128, 'too_long'),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({ token: oneTimeTokenSchema }).strict();

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({ email: emailSchema }).strict();

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
