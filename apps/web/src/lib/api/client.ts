import {
  ERROR_CODES,
  type ApiErrorResponse,
  type ErrorCode,
  type FieldError,
} from '@afghan-it-academy/shared/errors';

import { API_BASE_URL } from './base-url';

/**
 * A non-2xx response, carrying the API's stable error code.
 *
 * The code is what the UI translates. `message` is the developer-facing string
 * from the envelope and must never be rendered to a user — doing so would put
 * untranslated English in front of a Dari reader, which the whole error-code
 * contract exists to prevent.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: readonly FieldError[];
  readonly requestId: string | null;

  constructor(init: {
    code: ErrorCode;
    status: number;
    message: string;
    fields?: readonly FieldError[] | undefined;
    requestId?: string | null | undefined;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.fields = init.fields ?? [];
    this.requestId = init.requestId ?? null;
  }

  /** Field errors as a path → rule map, which is how forms want them. */
  fieldRules(): Record<string, string> {
    return Object.fromEntries(this.fields.map((field) => [field.path, field.rule]));
  }
}

function isErrorEnvelope(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null) return false;
  const { error } = value as { error?: unknown };
  if (typeof error !== 'object' || error === null) return false;
  return typeof (error as { code?: unknown }).code === 'string';
}

/** Parses a JSON body, treating an empty or malformed one as absent. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Calls the API with cookie credentials attached.
 *
 * `credentials: 'include'` is mandatory: the session lives in an `httpOnly`
 * cookie the document cannot read, so a request without it is anonymous no
 * matter who is signed in.
 *
 * Every failure — HTTP error, malformed body, network loss — surfaces as an
 * `ApiError` with a code from the shared catalogue, so callers have exactly one
 * shape to handle and never see a raw fetch rejection.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Built through Headers rather than object spread: `HeadersInit` may be an
  // array of pairs, and spreading that yields numeric indices instead of names.
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, credentials: 'include', headers });
  } catch {
    // A dropped connection is the common case here, not an exception: treat it
    // as a service-unavailable the UI can phrase as "check your connection".
    throw new ApiError({
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      status: 0,
      message: 'The request did not reach the server.',
    });
  }

  if (response.status === 204) return undefined as T;

  const body = await readJson(response);

  if (!response.ok) {
    if (isErrorEnvelope(body)) {
      throw new ApiError({
        code: body.error.code,
        status: response.status,
        message: body.error.message,
        fields: body.error.fields,
        requestId: body.error.requestId,
      });
    }

    // A non-2xx that is not the documented envelope means a proxy or gateway
    // answered, not the API. Do not guess at its body.
    throw new ApiError({
      code: ERROR_CODES.INTERNAL_ERROR,
      status: response.status,
      message: `Unexpected response (${String(response.status)}).`,
    });
  }

  return body as T;
}
