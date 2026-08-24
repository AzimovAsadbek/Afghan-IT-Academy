import type { PermissionKey } from '@afghan-it-academy/shared';
import type { Request } from 'express';

/**
 * Who is making a request, and what they may do.
 *
 * Deliberately not the User entity. A guard needs an identifier, a session and a
 * permission set; handing it the whole account invites handlers to read fields
 * that were never authorised and to serialise ones that should not leave the
 * data layer.
 */
export interface AuthenticatedActor {
  readonly userId: string;
  readonly sessionId: string;
  /** Effective permissions: the union across every role held. */
  readonly permissions: readonly PermissionKey[];
}

/**
 * The port the authentication guard depends on.
 *
 * This interface, and not the identity module, is what `common` knows about.
 * Identity provides the implementation at composition time, so a domain module
 * that wants `@RequirePermissions` imports guards from `common` and acquires no
 * dependency on identity at all — which keeps the dependency direction
 * `modules → common` rather than turning identity into a hub every module
 * imports. See docs/architecture/decisions/0007.
 */
export interface ActorResolver {
  /**
   * Resolves the credential presented on a request.
   *
   * @returns the actor, or null when no valid credential was presented. Never
   *   throws for an ordinary "not signed in" — that is the guard's decision to
   *   make, and some routes are public.
   */
  resolve(request: Request): Promise<AuthenticatedActor | null>;
}

/** DI token. A symbol, so nothing binds to it accidentally by string. */
export const ACTOR_RESOLVER = Symbol('ACTOR_RESOLVER');

/** An Express request after the authentication guard has admitted an actor. */
export interface RequestWithActor extends Request {
  readonly actor: AuthenticatedActor;
}
