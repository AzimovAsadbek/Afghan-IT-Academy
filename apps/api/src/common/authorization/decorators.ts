import type { PermissionKey } from '@afghan-it-academy/shared';
import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedActor, RequestWithActor } from './actor.js';

export const IS_PUBLIC = Symbol('IS_PUBLIC');
export const REQUIRED_PERMISSIONS = Symbol('REQUIRED_PERMISSIONS');

/**
 * Opts a route out of authentication.
 *
 * Authentication is on by default — the guard is global — so this is the only
 * way to expose an endpoint anonymously. That direction matters: an endpoint
 * added next year is protected unless someone deliberately writes `@Public()`,
 * rather than exposed unless someone remembers to guard it.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/**
 * Requires every listed permission.
 *
 * "Every", not "any", because an endpoint that touches two capabilities should
 * demand both — `@RequirePermissions(A, B)` reading as "A or B" is the kind of
 * quiet over-permission nobody notices until an audit.
 *
 * Typed to PermissionKey, so a typo is a compile error rather than a permission
 * that can never be satisfied.
 */
export const RequirePermissions = (
  ...permissions: readonly [PermissionKey, ...PermissionKey[]]
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_PERMISSIONS, permissions);

/**
 * Injects the authenticated actor.
 *
 * Throws rather than returning undefined on an unguarded route: a handler that
 * silently receives `undefined` for the current user is one `if` away from
 * treating an anonymous request as someone.
 */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedActor => {
    const request = context.switchToHttp().getRequest<Partial<RequestWithActor>>();

    if (!request.actor) {
      throw new Error(
        'CurrentActor was used on a route with no authenticated actor. Remove @Public() ' +
          'from this handler, or stop asking for the actor.',
      );
    }

    return request.actor;
  },
);
