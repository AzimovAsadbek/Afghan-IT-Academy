import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import {
  AllExceptionsFilter,
  REQUEST_ID_HEADER,
  createRequestIdMiddleware,
} from '../common/index.js';
import type { Env } from '../config/index.js';

/**
 * Applies every cross-cutting concern to a Nest application instance.
 *
 * Shared by main.ts and the e2e suite on purpose: when tests configure the app
 * themselves, they drift from production, and the security middleware ends up
 * being the part nobody actually tests.
 */
export function configureApp(app: NestExpressApplication, env: Env): void {
  const logger = app.get(Logger);
  app.useLogger(logger);

  /* First in the chain: every log line, error body and response header for this
   * request must carry the same correlation id. */
  app.use(createRequestIdMiddleware());

  /* --- Proxy awareness ---------------------------------------------------
   * Rate limiting and audit logging both key off the client IP. Behind a load
   * balancer that IP only appears in X-Forwarded-For. Trusting the header
   * unconditionally lets any caller spoof it, so the number of trusted hops is
   * configured explicitly per deployment and defaults to zero.
   */
  app.set('trust proxy', env.TRUSTED_PROXY_HOPS);

  /* --- Security headers -------------------------------------------------- */
  app.use(
    helmet({
      // The API serves JSON only; a CSP here protects error pages and any
      // accidental HTML response.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts:
        env.NODE_ENV === 'production'
          ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
          : false,
    }),
  );

  // Reduces JSON payload size substantially on slow Afghan connections.
  app.use(compression());

  /* --- CORS ---------------------------------------------------------------
   * An explicit allow-list, never a reflected origin. Credentials are enabled
   * because refresh tokens travel in httpOnly cookies.
   */
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language', REQUEST_ID_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER],
    maxAge: 86_400,
  });

  /* --- Request body limits -----------------------------------------------
   * Uploads go to object storage through signed URLs; nothing large should
   * ever reach this process.
   */
  app.useBodyParser('json', { limit: env.BODY_LIMIT_BYTES });
  app.useBodyParser('urlencoded', { limit: env.BODY_LIMIT_BYTES, extended: true });

  app.setGlobalPrefix(env.API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  /* Validation is Zod-based and applied at each handler boundary via
   * ZodValidationPipe (src/common/pipes). Nest's built-in ValidationPipe is
   * deliberately NOT registered: it is class-validator based, and running two
   * validation systems side by side guarantees they eventually disagree about
   * what a valid payload is. Zod also lets the same schema be shared with the
   * web app through @afghan-it-academy/shared. */

  app.useGlobalFilters(new AllExceptionsFilter(logger));

  // Lets Kubernetes drain in-flight requests instead of severing connections.
  app.enableShutdownHooks();
}
