import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@afghan-it-academy/shared/policy';

/**
 * Client-side form validation.
 *
 * Hand-written rather than a Zod schema shared with the API, deliberately. The
 * bounds come from `@afghan-it-academy/shared` so they cannot drift, but Zod
 * itself stays out of the client bundle — roughly 14 kB gzipped to re-check
 * what the server checks again anyway, on connections where every kilobyte is
 * paid for. `.claude/rules/frontend.md` asks for exactly this trade.
 *
 * This is a courtesy layer: it saves a round trip on an obviously bad input.
 * **The server is the validator**, and every one of these rules is enforced
 * again there.
 *
 * Each function returns a machine-readable rule token — the same vocabulary the
 * API's `fields[].rule` uses — which the caller translates. No English here.
 */

export type ValidationRule = string;

export function validateEmail(value: string): ValidationRule | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'required';
  if (trimmed.length > EMAIL_MAX_LENGTH) return 'too_long';
  // Deliberately permissive. A stricter pattern rejects addresses that are
  // genuinely valid (plus-addressing, new TLDs, non-ASCII local parts), and the
  // only authority on whether an address works is whether the mail arrives.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'invalid_email';
  return null;
}

export function validatePassword(value: string): ValidationRule | null {
  if (value.length === 0) return 'required';
  if (value.length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (value.length > PASSWORD_MAX_LENGTH) return 'too_long';
  if (/^\s|\s$/.test(value)) return 'leading_or_trailing_whitespace';
  return null;
}

/**
 * The current password at sign-in and at change time.
 *
 * Only checked for presence: an existing password may predate a policy change,
 * and rejecting it here would lock the owner out of the screen that lets them
 * fix it. Mirrors the API's reasoning in `auth.dto.ts`.
 */
export function validateRequired(value: string): ValidationRule | null {
  return value.length === 0 ? 'required' : null;
}

export function validateDisplayName(value: string): ValidationRule | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'required';
  if (trimmed.length < DISPLAY_NAME_MIN_LENGTH) return 'too_short';
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) return 'too_long';
  if (/\p{Cc}/u.test(trimmed)) return 'invalid_characters';
  return null;
}

/** Drops the entries with no error, so an empty object means "valid". */
export function collectErrors(
  candidates: Record<string, ValidationRule | null>,
): Record<string, ValidationRule> {
  return Object.fromEntries(
    Object.entries(candidates).filter(
      (entry): entry is [string, ValidationRule] => entry[1] !== null,
    ),
  );
}
