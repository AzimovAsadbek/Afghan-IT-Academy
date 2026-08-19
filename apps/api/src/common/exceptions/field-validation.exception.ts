import type { FieldError } from '@afghan-it-academy/shared';

/**
 * Raised when a request payload fails schema validation.
 *
 * Carries structured, machine-readable field errors rather than a prose
 * message, so the client can attach each error to the right form input in the
 * user's own language.
 */
export class FieldValidationException extends Error {
  constructor(readonly fields: readonly FieldError[]) {
    super('Request validation failed');
    this.name = 'FieldValidationException';
  }
}
