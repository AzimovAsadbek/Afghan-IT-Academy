import { ERROR_CODES, type PermissionKey } from '@afghan-it-academy/shared';
import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { DomainException } from '../exceptions/domain.exception.js';
import type { RequestWithActor } from './actor.js';
import { REQUIRED_PERMISSIONS } from './decorators.js';

/**
 * Enforces the permissions a route declares.
 *
 * Runs after AuthenticationGuard, so an actor is already present. Checks
 * permission *keys*, never role names — `role === 'ADMIN'` cannot express "this
 * one support agent may issue refunds", and every such check has to be found and
 * edited when the answer changes.
 *
 * A denial is a 403 with FORBIDDEN. It deliberately does not name the missing
 * permission: an authenticated user probing an endpoint should not be handed a
 * map of what they would need.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<readonly PermissionKey[] | undefined>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const { actor } = request as Partial<RequestWithActor>;

    if (!actor) {
      // Reachable only if a route is both @Public() and @RequirePermissions(),
      // which is a contradiction. Refusing is the safe reading.
      throw new DomainException(
        ERROR_CODES.UNAUTHENTICATED,
        HttpStatus.UNAUTHORIZED,
        'Authentication is required.',
      );
    }

    const held = new Set<string>(actor.permissions);
    const satisfied = required.every((permission) => held.has(permission));

    if (!satisfied) {
      throw new DomainException(
        ERROR_CODES.FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'You do not have permission to perform this action.',
      );
    }

    return true;
  }
}
