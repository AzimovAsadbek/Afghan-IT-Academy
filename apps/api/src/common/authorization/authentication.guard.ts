import { ERROR_CODES } from '@afghan-it-academy/shared';
import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { DomainException } from '../exceptions/domain.exception.js';
import { ACTOR_RESOLVER, type ActorResolver, type RequestWithActor } from './actor.js';
import { IS_PUBLIC } from './decorators.js';

/**
 * Authenticates every request unless the route opts out.
 *
 * Registered as an APP_GUARD, so protection is the default and exposure is the
 * deliberate act. The inverse — guarding routes individually — fails silently
 * the first time someone forgets, and forgetting is invisible in review because
 * the missing thing is not on the page.
 *
 * The credential is resolved through a port, so this file knows nothing about
 * sessions, tokens or users.
 */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACTOR_RESOLVER) private readonly actors: ActorResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const actor = await this.actors.resolve(request);

    if (actor) {
      // Attached even on public routes: an endpoint can then personalise its
      // response for a signed-in visitor without becoming private.
      (request as { actor?: unknown }).actor = actor;
    }

    if (isPublic) return true;

    if (!actor) {
      throw new DomainException(
        ERROR_CODES.UNAUTHENTICATED,
        HttpStatus.UNAUTHORIZED,
        'Authentication is required.',
      );
    }

    return true;
  }
}

/** Narrows a request once the guard has run. Throws if used on a public route. */
export function actorOf(request: Request): RequestWithActor['actor'] {
  const { actor } = request as Partial<RequestWithActor>;
  if (!actor) throw new Error('No authenticated actor on this request.');
  return actor;
}
