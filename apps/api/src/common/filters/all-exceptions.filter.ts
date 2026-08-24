import {
  ERROR_CODES,
  type ApiErrorResponse,
  type ErrorCode,
  type FieldError,
} from '@afghan-it-academy/shared';
import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Injectable,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { Logger } from 'nestjs-pino';

import { DomainException } from '../exceptions/domain.exception.js';
import { FieldValidationException } from '../exceptions/field-validation.exception.js';
import type { RequestWithId } from '../http/request-with-id.js';

/** HTTP status -> stable error code. Anything unmapped is an internal error. */
/** Everything at or above this status is a server fault worth alerting on. */
const SERVER_ERROR_THRESHOLD = 500;

const STATUS_TO_CODE: Readonly<Record<number, ErrorCode | undefined>> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODES.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODES.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ERROR_CODES.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_CODES.NOT_FOUND,
  [HttpStatus.CONFLICT]: ERROR_CODES.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ERROR_CODES.PAYLOAD_TOO_LARGE,
  [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ERROR_CODES.SERVICE_UNAVAILABLE,
};

/**
 * Single exit point for every error leaving the API.
 *
 * Two guarantees the rest of the codebase depends on:
 *   1. Clients always receive the same envelope, keyed by a stable error code
 *      they translate into Dari/Pashto/English themselves.
 *   2. Internal failures never leak their message, stack, driver text or SQL to
 *      the client. The detail goes to the logs, keyed by the request id.
 */
@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestWithId>();
    const response = ctx.getResponse<Response>();

    const { status, code, message, fields } = this.describe(exception);

    if (status >= SERVER_ERROR_THRESHOLD) {
      // Full detail, server side only.
      this.logger.error(
        {
          err: exception,
          requestId: request.requestId,
          method: request.method,
          path: request.url,
        },
        'Unhandled exception',
      );
    } else {
      this.logger.warn(
        { requestId: request.requestId, method: request.method, path: request.url, code, status },
        'Request failed',
      );
    }

    const body: ApiErrorResponse = {
      error: {
        code,
        message,
        ...(fields ? { fields } : {}),
        requestId: request.requestId,
        timestamp: new Date().toISOString(),
      },
    };

    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    fields?: readonly FieldError[];
  } {
    if (exception instanceof FieldValidationException) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Request validation failed.',
        fields: exception.fields,
      };
    }

    // Checked before HttpException, which it extends: a domain exception knows
    // its own code, and the status-derived fallback below would discard it.
    if (exception instanceof DomainException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        code: STATUS_TO_CODE[status] ?? ERROR_CODES.INTERNAL_ERROR,
        // Framework-produced messages are safe; they describe the contract, not internals.
        message: exception.message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.INTERNAL_ERROR,
      // Deliberately opaque. Detail is in the logs under this request id.
      message: 'An unexpected error occurred.',
    };
  }
}
