import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Header used to correlate a request across web, API, logs and error reports. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Cap on an inbound id: it is echoed into logs and responses, so it is untrusted input. */
const MAX_INBOUND_ID_LENGTH = 128;
const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Accepts a caller-supplied id only when it is well-formed, otherwise mints one.
 *
 * An inbound id is echoed into log lines and error bodies, so it is validated
 * rather than trusted: an unbounded or control-character-laden value would allow
 * log injection and forgery of adjacent log records.
 */
export function resolveRequestId(inbound: string | string[] | undefined): string {
  const candidate = Array.isArray(inbound) ? inbound[0] : inbound;

  return typeof candidate === 'string' &&
    candidate.length > 0 &&
    candidate.length <= MAX_INBOUND_ID_LENGTH &&
    SAFE_ID_PATTERN.test(candidate)
    ? candidate
    : randomUUID();
}

/**
 * Registered with `app.use()` rather than as Nest module middleware.
 *
 * Ordering is the reason: the HTTP logger is installed as module middleware, so
 * anything registered through `MiddlewareConsumer` may run *after* it. Binding
 * at the Express layer guarantees the id exists before the first log line is
 * written, and every subsequent line for that request carries the same value.
 */
export function createRequestIdMiddleware(): RequestHandler {
  return function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER]);

    // Attaching per-request state to `req` is the Express middleware contract,
    // and this is the single place in the codebase that does it.
    // eslint-disable-next-line no-param-reassign -- Express middleware contract
    (req as { requestId?: string }).requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  };
}
