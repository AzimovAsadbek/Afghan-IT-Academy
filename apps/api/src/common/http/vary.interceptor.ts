import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * Declares the request headers a response's content depends on.
 *
 * A response that changes with a request header but does not say so is a cache
 * poisoning waiting to happen: a shared cache keys on the URL plus whatever
 * `Vary` names, so an unlisted header means one visitor's copy is served to
 * everyone. For a catalogue whose text is chosen by `Accept-Language`, that is
 * a Dari reader receiving English.
 *
 * Uses Express's `res.vary()`, which **appends** to any existing value. Setting
 * the header directly would drop `Origin` and `Accept-Encoding`, which CORS and
 * compression put there — trading one caching bug for two.
 *
 * Lives in `common` because it is a pure HTTP concern with no domain knowledge:
 * any module whose responses vary by a header can apply it.
 */
@Injectable()
export class VaryInterceptor implements NestInterceptor {
  private readonly headers: readonly string[];

  constructor(...headers: readonly string[]) {
    this.headers = headers;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();

    // Set before the handler runs, so it is present on error responses too —
    // a cached 404 keyed without Accept-Language is the same bug.
    for (const header of this.headers) response.vary(header);

    return next.handle();
  }
}
