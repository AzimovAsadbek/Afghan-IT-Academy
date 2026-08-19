import { z } from 'zod';

/**
 * Environment contract.
 *
 * The process refuses to start if this schema does not parse. That is
 * deliberate: a misconfigured production boot should fail loudly at startup,
 * not silently at 03:00 when the first request touches an undefined variable.
 *
 * Rules enforced here:
 *   - secrets have no defaults, ever;
 *   - development-only conveniences are rejected in production;
 *   - types are coerced once, at the edge, so the rest of the app sees real
 *     numbers and booleans rather than strings.
 */

const nodeEnvSchema = z.enum(['development', 'test', 'production']);

/** Comma-separated origin list -> validated array. */
const originListSchema = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .pipe(z.array(z.url({ protocol: /^https?$/ })).min(1));

export const envSchema = z
  .object({
    /* --- Runtime -------------------------------------------------------- */
    NODE_ENV: nodeEnvSchema.default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    /** Path prefix for every route, e.g. `/api`. */
    API_PREFIX: z.string().startsWith('/').default('/api'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    /* --- Data stores ---------------------------------------------------- */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),

    /* --- HTTP security -------------------------------------------------- */
    CORS_ORIGINS: originListSchema,
    /** Requests allowed per window, per client key. */
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(60_000),
    /** Trust N reverse-proxy hops for client IP resolution. 0 = trust none. */
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

    /* --- Body limits ------------------------------------------------------
     * Kept small by default. Media uploads go to object storage via signed
     * URLs, never through the API process.
     */
    BODY_LIMIT_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(10 * 1_024 * 1_024)
      .default(1_024 * 1_024),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    if (env.CORS_ORIGINS.some((origin) => origin.startsWith('http://'))) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Plain-HTTP origins are not allowed in production.',
      });
    }

    if (env.LOG_LEVEL === 'trace' || env.LOG_LEVEL === 'debug') {
      ctx.addIssue({
        code: 'custom',
        path: ['LOG_LEVEL'],
        message: 'debug/trace logging leaks request payloads; use info or higher in production.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and freeze the environment.
 *
 * @throws {Error} with every offending variable listed, so a broken deploy is
 *   fixed in one pass instead of one variable per restart.
 */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return Object.freeze(result.data);
}
