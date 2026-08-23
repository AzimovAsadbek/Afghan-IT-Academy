/**
 * The numeric bounds behind the validation primitives.
 *
 * Separated from `primitives.ts` because the web app needs the *numbers* — to
 * check a password before spending a round trip on a metered connection, and to
 * render "at least 12 characters" in three languages — but must not pay for Zod
 * in the client bundle to get them. `primitives.ts` builds its schemas from
 * these, so the two cannot drift.
 *
 * This module imports nothing. Keep it that way.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 80;

export const EMAIL_MAX_LENGTH = 254;

/** Bounds of the opaque one-time token carried by a verification or reset link. */
export const ONE_TIME_TOKEN_MIN_LENGTH = 20;
export const ONE_TIME_TOKEN_MAX_LENGTH = 128;
