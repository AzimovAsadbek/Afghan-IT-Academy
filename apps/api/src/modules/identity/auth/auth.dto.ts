import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  ONE_TIME_TOKEN_MAX_LENGTH,
  ONE_TIME_TOKEN_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  emailSchema,
  localeSchema,
  passwordSchema,
} from '@afghan-it-academy/shared';
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
  .min(DISPLAY_NAME_MIN_LENGTH, 'too_short')
  .max(DISPLAY_NAME_MAX_LENGTH, 'too_long')
  // Control characters would corrupt log lines and email headers. Expressed
  // as the Unicode 'Other, control' property rather than a literal range, so
  // the source contains no control characters of its own.
  .refine((value) => !/\p{Cc}/u.test(value), 'invalid_characters');

/** The opaque one-time token from a verification or reset link. */
const oneTimeTokenSchema = z
  .string()
  .min(ONE_TIME_TOKEN_MIN_LENGTH, 'invalid_token')
  .max(ONE_TIME_TOKEN_MAX_LENGTH, 'invalid_token')
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
    password: z.string().min(1, 'required').max(PASSWORD_MAX_LENGTH, 'too_long'),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({ token: oneTimeTokenSchema }).strict();

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({ email: emailSchema }).strict();

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: oneTimeTokenSchema,
    newPassword: passwordSchema,
  })
  .strict();

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    // Not passwordSchema: the current password may predate a policy change, and
    // refusing it here would stop the owner reaching the very screen that lets
    // them fix it.
    currentPassword: z.string().min(1, 'required').max(PASSWORD_MAX_LENGTH, 'too_long'),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'must_differ',
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
