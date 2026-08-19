/**
 * Stable, machine-readable error codes.
 *
 * The API never returns a human-readable error message as the source of truth:
 * the client owns presentation and translates the code into Dari, Pashto or
 * English. A `message` field may accompany a code, but it is for developers and
 * logs, never for end users.
 *
 * Codes are permanent contract. Rename one and you break every translated
 * string and every mobile client already in the field.
 */
export const ERROR_CODES = {
  /* --- Generic ------------------------------------------------------------ */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  /* --- Identity and access ------------------------------------------------ */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Field-level validation detail, addressed by a JSON path. */
export interface FieldError {
  /** Dot/bracket path into the submitted payload, e.g. `profile.email`. */
  readonly path: string;
  /** Machine-readable reason, e.g. `too_small`, `invalid_email`. */
  readonly rule: string;
}

/**
 * The single error envelope every endpoint returns. Clients can rely on this
 * shape for all non-2xx responses.
 */
export interface ApiErrorResponse {
  readonly error: {
    readonly code: ErrorCode;
    /** Developer-facing description. Never rendered to end users. */
    readonly message: string;
    /** Present only for VALIDATION_FAILED. */
    readonly fields?: readonly FieldError[];
    /** Correlates the response with server logs. */
    readonly requestId: string;
    readonly timestamp: string;
  };
}
