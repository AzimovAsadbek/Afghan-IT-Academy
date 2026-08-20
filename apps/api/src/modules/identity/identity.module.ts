import { Module } from '@nestjs/common';

import { PasswordService, TokenService } from './crypto/index.js';
import { SessionService, SessionStore } from './sessions/index.js';

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
  providers: [PasswordService, TokenService, SessionStore, SessionService],
  exports: [PasswordService, TokenService, SessionService],
})
export class IdentityModule {}
