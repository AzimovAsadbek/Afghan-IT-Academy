import type { PermissionKey } from '@afghan-it-academy/shared';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import type { ActorResolver, AuthenticatedActor } from '../../../common/index.js';
import { readAccessToken } from '../auth/index.js';
import { SessionService } from '../sessions/index.js';
import { UserService } from '../users/index.js';
import { PermissionCache } from './permission-cache.js';

/**
 * Identity's implementation of the authentication port.
 *
 * This is the only place that knows an access token maps to a Redis-backed
 * session, which in turn maps to a user whose roles imply permissions. The
 * guards in `common` see none of it — they receive an actor or null.
 *
 * That indirection is what lets `courses` and `payments` use
 * `@RequirePermissions` without importing identity, and what will let OAuth or a
 * second factor be added later as another way to *produce* a session rather than
 * as a second authentication system.
 */
@Injectable()
export class SessionActorResolver implements ActorResolver {
  constructor(
    private readonly sessions: SessionService,
    private readonly users: UserService,
    private readonly cache: PermissionCache,
  ) {}

  async resolve(request: Request): Promise<AuthenticatedActor | null> {
    const token = readAccessToken(request);
    if (token === null) return null;

    const active = await this.sessions.resolveAccessToken(token);
    if (active === null) return null;

    return {
      userId: active.userId,
      sessionId: active.sessionId,
      permissions: await this.permissionsFor(active.userId),
    };
  }

  private async permissionsFor(userId: string): Promise<PermissionKey[]> {
    const cached = await this.cache.get(userId);
    if (cached !== null) return cached;

    const permissions = (await this.users.permissionsOf(userId)) as PermissionKey[];
    await this.cache.set(userId, permissions);

    return permissions;
  }
}
