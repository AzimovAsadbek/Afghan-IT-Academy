export {
  ACTOR_RESOLVER,
  AuthenticationGuard,
  CurrentActor,
  IS_PUBLIC,
  PermissionsGuard,
  Public,
  REQUIRED_PERMISSIONS,
  RequirePermissions,
  actorOf,
  type ActorResolver,
  type AuthenticatedActor,
  type RequestWithActor,
} from './authorization/index.js';
export { AllExceptionsFilter } from './filters/all-exceptions.filter.js';
export { DomainException } from './exceptions/domain.exception.js';
export { FieldValidationException } from './exceptions/field-validation.exception.js';
export { buildLoggerConfig } from './logging/logger.config.js';
export type { RequestWithId } from './http/request-with-id.js';
export { clientContextOf, truncateIpAddress, type ClientContext } from './http/client-context.js';
export {
  REQUEST_ID_HEADER,
  createRequestIdMiddleware,
  resolveRequestId,
} from './middleware/request-id.middleware.js';
export { ZodValidationPipe } from './pipes/zod-validation.pipe.js';
