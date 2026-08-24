import type { ErrorCode } from '@afghan-it-academy/shared';
import { HttpException, type HttpStatus } from '@nestjs/common';

/**
 * An exception that names its own error code.
 *
 * `AllExceptionsFilter` otherwise derives the code from the HTTP status, which
 * is a reasonable default for framework-raised errors but collapses meaning
 * where several domain outcomes share a status. Three quite different sign-in
 * refusals — the account is locked, it is suspended, the address is unverified —
 * are all 403, and a client that receives `FORBIDDEN` for each cannot tell the
 * user which of the three happened or what to do about it.
 *
 * The code is what the client translates, so it has to survive the trip.
 */
export class DomainException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: HttpStatus,
    /** Developer-facing only. The client renders the code, never this. */
    message?: string,
  ) {
    super(message ?? code, status);
    this.name = 'DomainException';
  }
}
