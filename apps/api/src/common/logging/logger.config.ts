import type { Params as PinoParams } from 'nestjs-pino';

import type { Env } from '../../config/index.js';

/**
 * Fields that must never reach a log sink.
 *
 * Redaction is applied at the logger, not at each call site: relying on every
 * future developer to remember not to log a request body is not a control.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.otp',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.accessToken',
  '*.secret',
];

/**
 * Structured JSON logging in every environment; pretty-printed only for a human
 * at a terminal. Log aggregation cannot parse prettified output, so it stays
 * strictly a development affordance.
 */
export function buildLoggerConfig(env: Env): PinoParams {
  const isDevelopment = env.NODE_ENV === 'development';

  return {
    // nestjs-pino still defaults to the pre-Express-5 wildcard ('*'), which Nest
    // auto-converts while logging a deprecation warning on every boot. Naming
    // the parameter explicitly keeps startup output clean.
    forRoutes: ['{*path}'],
    pinoHttp: {
      level: env.LOG_LEVEL,
      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
      // createRequestIdMiddleware runs at the Express layer, before this logger,
      // so the validated id is already attached. Using it as pino's own request id
      // keeps the access log, the error log and the response header identical.
      genReqId: (req) => (req as { requestId?: string }).requestId ?? '',
      autoLogging: {
        // Probes run every few seconds; logging them buries real traffic.
        ignore: (req) => req.url === '/health/live' || req.url === '/health/ready',
      },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          // Query strings can carry user input; the path alone is enough to debug.
          url: req.url.split('?')[0],
        }),
      },
      ...(isDevelopment
        ? {
            transport: {
              target: 'pino-pretty',
              options: { singleLine: true, colorize: true, translateTime: 'HH:MM:ss.l' },
            },
          }
        : {}),
    },
  };
}
