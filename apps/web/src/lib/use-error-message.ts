'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { ApiError } from './api/client';

/**
 * Turns an API failure into text in the reader's language.
 *
 * The API deliberately returns codes rather than prose, so this is the layer
 * that owns wording. It exists as a hook because it is the one place allowed to
 * decide what an error *says* — scattering `t('errors.codes.' + code)` through
 * components is how an untranslated code eventually reaches a user.
 *
 * Anything that is not an `ApiError` — a bug in our own code — is reported as a
 * generic internal error. The real cause belongs in the console, not in front of
 * a learner.
 */
export function useErrorMessage(): (error: unknown) => string {
  const t = useTranslations('errors.codes');

  return useCallback(
    (error: unknown) => {
      if (!(error instanceof ApiError)) return t('INTERNAL_ERROR');

      // has() rather than a try/catch: a code this build does not know about —
      // an older client against a newer API — must degrade to a sentence, not
      // throw inside render.
      return t.has(error.code) ? t(error.code) : t('INTERNAL_ERROR');
    },
    [t],
  );
}

/**
 * Turns a field rule token into text.
 *
 * The tokens come from two places that must agree: `fields[].rule` in the API's
 * validation envelope, and the local pre-submit checks in `lib/validation.ts`.
 * Both use the same vocabulary, so both land here.
 */
export function useFieldErrorMessage(): (rule: string | undefined) => string | undefined {
  const t = useTranslations('errors.fields');

  return useCallback(
    (rule: string | undefined) => {
      if (rule === undefined) return undefined;
      return t.has(rule) ? t(rule) : t('unknown');
    },
    [t],
  );
}

/** Merges local pre-submit errors with the field errors an API rejection carried. */
export function fieldRulesFrom(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fieldRules() : {};
}
