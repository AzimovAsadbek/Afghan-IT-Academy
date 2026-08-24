import { ERROR_CODES, PERMISSIONS, isRoleKey, type RoleKey } from '@afghan-it-academy/shared';
import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

import {
  CurrentActor,
  DomainException,
  RequirePermissions,
  ZodValidationPipe,
  clientContextOf,
  type AuthenticatedActor,
} from '../../../common/index.js';
import { RoleAssignmentService, type RoleChangeFailure } from './role-assignment.service.js';

const grantRoleSchema = z
  .object({
    role: z.string().refine(isRoleKey, 'unknown_role'),
  })
  .strict();

interface GrantRoleInput {
  role: RoleKey;
}

/**
 * Role administration.
 *
 * Gated on `user:assign_role`, which only SUPER_ADMIN holds by seed. That is
 * the one capability that can create every other capability, so it is
 * deliberately not bundled into ADMIN — an administrator who can grant
 * themselves any role is not meaningfully constrained by any other permission.
 */
@Controller({ path: 'admin/users', version: '1' })
export class RoleController {
  constructor(private readonly roles: RoleAssignmentService) {}

  @Post(':userId/roles')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.USER_ASSIGN_ROLE)
  async grant(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(grantRoleSchema)) body: GrantRoleInput,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() request: Request,
  ): Promise<{ changed: boolean }> {
    const result = await this.roles.grant(
      userId,
      body.role,
      actor.userId,
      clientContextOf(request),
    );

    if (!result.ok) throw this.failureToException(result.reason);
    return { changed: result.changed };
  }

  @Delete(':userId/roles/:role')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.USER_ASSIGN_ROLE)
  async revoke(
    @Param('userId') userId: string,
    @Param('role') role: string,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() request: Request,
  ): Promise<{ changed: boolean }> {
    if (!isRoleKey(role)) {
      throw new DomainException(ERROR_CODES.NOT_FOUND, HttpStatus.NOT_FOUND, 'No such role.');
    }

    const result = await this.roles.revoke(userId, role, actor.userId, clientContextOf(request));

    if (!result.ok) throw this.failureToException(result.reason);
    return { changed: result.changed };
  }

  private failureToException(reason: RoleChangeFailure): DomainException {
    return new DomainException(
      ERROR_CODES.NOT_FOUND,
      HttpStatus.NOT_FOUND,
      reason === 'unknown_user' ? 'No such account.' : 'No such role.',
    );
  }
}
