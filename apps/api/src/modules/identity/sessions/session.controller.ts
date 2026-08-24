import { ERROR_CODES } from '@afghan-it-academy/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  CurrentActor,
  DomainException,
  ZodValidationPipe,
  clientContextOf,
  type AuthenticatedActor,
} from '../../../common/index.js';
import { AuditService } from '../../audit/index.js';
import { changePasswordSchema, type ChangePasswordInput } from '../auth/auth.dto.js';
import { PasswordRecoveryService } from '../auth/password.service.js';
import { AUTH_ACTIONS } from '../auth-actions.js';
import { UserService, type PublicUser } from '../users/user.service.js';
import { SessionService, type SessionSummary } from './session.service.js';

/**
 * The signed-in user's own account and devices.
 *
 * Every route here is authenticated by the global guard. None declares a
 * permission, because acting on your own account is authorised by ownership, not
 * by a capability — and ownership is checked against the actor's own id rather
 * than anything in the URL.
 */
@Controller({ path: 'me', version: '1' })
export class SessionController {
  constructor(
    private readonly sessions: SessionService,
    private readonly users: UserService,
    private readonly audit: AuditService,
    private readonly recovery: PasswordRecoveryService,
  ) {}

  /** The current user, their roles and effective permissions. */
  @Get()
  async me(@CurrentActor() actor: AuthenticatedActor): Promise<PublicUser> {
    const user = await this.users.findPublic(actor.userId);

    if (!user) {
      // The session resolved but the account is gone — a deleted user with a
      // live session. Treat as unauthenticated rather than 500.
      throw new DomainException(
        ERROR_CODES.UNAUTHENTICATED,
        HttpStatus.UNAUTHORIZED,
        'Account no longer exists.',
      );
    }

    return user;
  }

  /** Devices currently signed in, with the present one flagged. */
  @Get('sessions')
  async listSessions(@CurrentActor() actor: AuthenticatedActor): Promise<SessionSummary[]> {
    return this.sessions.list(actor.userId, actor.sessionId);
  }

  /**
   * Revokes one session.
   *
   * The id comes from the URL, so ownership is a condition of the write itself
   * rather than a separate lookup taken on trust. Skipping it entirely is the
   * textbook IDOR: any signed-in user could sign out any other by guessing an
   * id.
   */
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Param('sessionId') sessionId: string,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() request: Request,
  ): Promise<void> {
    const revoked = await this.sessions.revokeOwned(sessionId, actor.userId, 'USER_LOGOUT');

    if (!revoked) {
      // One response for "no such session", "already revoked" and "belongs to
      // someone else". Distinguishing them confirms which ids are real.
      throw new DomainException(
        ERROR_CODES.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'No such session for this account.',
      );
    }

    await this.audit.record(
      {
        action: AUTH_ACTIONS.SESSION_REVOKED,
        actorId: actor.userId,
        entityType: 'Session',
        entityId: sessionId,
      },
      clientContextOf(request),
    );
  }

  /**
   * Changes the password.
   *
   * The current password is required even though the session already proves
   * identity: a session left open on a shared machine must not be enough to take
   * the account permanently. Every other device is signed out, because a
   * password change is usually a response to "someone may have my password" and
   * leaving their session alive makes the change theatre.
   */
  @Post('password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() request: Request,
  ): Promise<{ revokedSessions: number }> {
    const result = await this.recovery.change(
      actor.userId,
      actor.sessionId,
      body,
      clientContextOf(request),
    );

    if (!result.ok) {
      throw new DomainException(
        ERROR_CODES.INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
        'Current password is incorrect.',
      );
    }

    return { revokedSessions: result.revokedSessions };
  }

  /** Signs out every other device, keeping the current one. */
  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  async revokeOthers(
    @CurrentActor() actor: AuthenticatedActor,
    @Req() request: Request,
  ): Promise<{ revoked: number }> {
    const revoked = await this.sessions.revokeAllForUser(
      actor.userId,
      'USER_LOGOUT_ALL',
      actor.sessionId,
    );

    await this.audit.record(
      {
        action: AUTH_ACTIONS.SESSIONS_REVOKED_ALL,
        actorId: actor.userId,
        entityType: 'User',
        entityId: actor.userId,
        metadata: { revoked },
      },
      clientContextOf(request),
    );

    return { revoked };
  }
}
