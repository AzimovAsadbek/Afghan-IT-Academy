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

    /* --- Authentication ---------------------------------------------------
     * Argon2id parameters. The minimums are the OWASP baseline and the schema
     * refuses to go below them: a misconfigured deploy must fail at startup
     * rather than quietly hash every password with weak settings.
     */
    AUTH_ARGON2_MEMORY_KIB: z.coerce.number().int().min(19_456).max(1_048_576).default(19_456),
    AUTH_ARGON2_TIME_COST: z.coerce.number().int().min(2).max(10).default(2),
    AUTH_ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(4).default(1),

    /** Access token lifetime. Short, because revocation between refreshes
     *  relies on the session store being consulted at each request. */
    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
    /** Refresh token lifetime. Rotated on every use. */
    AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(3_600)
      .default(30 * 24 * 60 * 60),
    /** Hard ceiling on a session regardless of refresh activity. */
    AUTH_SESSION_ABSOLUTE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(3_600)
      .default(90 * 24 * 60 * 60),

    AUTH_EMAIL_VERIFICATION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .default(24 * 60 * 60),
    /** Deliberately shorter than verification: a reset link is a live
     *  credential for whoever holds the mailbox. */
    AUTH_PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(3_600),

    /** Cookie Domain attribute. Leave unset to scope cookies to the API host. */
    AUTH_COOKIE_DOMAIN: z.string().min(1).optional(),

    /** Origin the web app is served from. Used to build verification and reset
     *  links, so it must never be attacker-controlled — hence config, not a
     *  request header. */
    WEB_APP_URL: z.url({ protocol: /^https?$/ }),

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
    /* Token lifetimes must nest. A refresh token that outlives its session, or
     * an access token that outlives the refresh token, produces credentials
     * that appear valid but can never be exchanged. */
    if (env.AUTH_ACCESS_TOKEN_TTL_SECONDS >= env.AUTH_REFRESH_TOKEN_TTL_SECONDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_ACCESS_TOKEN_TTL_SECONDS'],
        message: 'The access token must expire before the refresh token.',
      });
    }

    if (env.AUTH_REFRESH_TOKEN_TTL_SECONDS > env.AUTH_SESSION_ABSOLUTE_TTL_SECONDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_REFRESH_TOKEN_TTL_SECONDS'],
        message: 'The refresh token must not outlive the session absolute lifetime.',
      });
    }

    if (env.NODE_ENV !== 'production') return;

    if (env.CORS_ORIGINS.some((origin) => origin.startsWith('http://'))) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Plain-HTTP origins are not allowed in production.',
      });
    }

    if (env.WEB_APP_URL.startsWith('http://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEB_APP_URL'],
        message: 'Verification and reset links must be https in production.',
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
