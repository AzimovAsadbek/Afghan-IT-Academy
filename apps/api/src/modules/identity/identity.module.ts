import { Module } from '@nestjs/common';

import { ACTOR_RESOLVER } from '../../common/index.js';
import { AuthController, AuthService, PasswordRecoveryService } from './auth/index.js';
import {
  PermissionCache,
  RoleAssignmentService,
  RoleController,
  SessionActorResolver,
} from './authorization/index.js';
import { PasswordService, TokenService } from './crypto/index.js';
import { SessionController, SessionService, SessionStore } from './sessions/index.js';
import { OneTimeTokenService } from './tokens/index.js';
import { UserService } from './users/index.js';

/**
 * Identity: accounts, credentials, sessions and authorization.
 *
 * Everything the platform knows about *who* someone is lives here. Other
 * domains never import this module's internals — the barrel in index.ts is the
 * whole public surface, enforced by boundaries/module-boundaries.
 *
 * At this commit it provides the cryptographic primitives and session
 * lifecycle; the authentication flows and authorization guards land in the
 * commits that follow.
 */
@Module({
  controllers: [AuthController, SessionController, RoleController],
  providers: [
    AuthService,
    PasswordRecoveryService,
    PasswordService,
    TokenService,
    SessionStore,
    SessionService,
    OneTimeTokenService,
    UserService,
    PermissionCache,
    RoleAssignmentService,

    /* Identity supplies the implementation of the authentication port that the
     * guards in common depend on. Binding it here, at composition time, is what
     * keeps every other domain free of any dependency on this module. */
    { provide: ACTOR_RESOLVER, useClass: SessionActorResolver },
  ],
  exports: [
    PasswordService,
    TokenService,
    SessionService,
    OneTimeTokenService,
    UserService,
    PermissionCache,
    RoleAssignmentService,
    ACTOR_RESOLVER,
  ],
})
export class IdentityModule {}
