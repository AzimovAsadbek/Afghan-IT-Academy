'use client';

import { formatNumber, type Locale } from '@afghan-it-academy/shared/i18n';
import { PASSWORD_MIN_LENGTH } from '@afghan-it-academy/shared/policy';
import { Alert, Button, Field } from '@afghan-it-academy/ui';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { register } from '@/lib/api/auth';
import { fieldRulesFrom, useErrorMessage, useFieldErrorMessage } from '@/lib/use-error-message';
import { formDataOf, readField, type FormSubmitEvent } from '@/lib/form';
import {
  collectErrors,
  validateDisplayName,
  validateEmail,
  validatePassword,
} from '@/lib/validation';

export function RegisterForm() {
  const t = useTranslations('auth.register');
  const shared = useTranslations('auth.shared');
  const describeError = useErrorMessage();
  const describeField = useFieldErrorMessage();
  const locale = useLocale() as Locale;

  const [fieldRules, setFieldRules] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: register,
    onError: (error) => {
      setFieldRules(fieldRulesFrom(error));
    },
  });

  function handleSubmit(event: FormSubmitEvent) {
    event.preventDefault();
    const form = formDataOf(event);

    const email = readField(form, 'email');
    const password = readField(form, 'password');
    const displayName = readField(form, 'displayName');

    // Checked here only to save a round trip on a metered connection. The
    // server validates all of it again.
    const local = collectErrors({
      displayName: validateDisplayName(displayName),
      email: validateEmail(email),
      password: validatePassword(password),
    });

    setFieldRules(local);
    if (Object.keys(local).length > 0) return;

    mutation.mutate({ email, password, displayName, preferredLocale: locale });
  }

  // The success message is identical whether or not the address was already
  // registered — the API refuses to distinguish them, and so must the UI.
  if (mutation.isSuccess) {
    return <Alert tone="success">{t('checkYourEmail')}</Alert>;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {mutation.isError && <Alert tone="error">{describeError(mutation.error)}</Alert>}

      <Field
        label={t('displayName')}
        name="displayName"
        autoComplete="name"
        required
        error={describeField(fieldRules.displayName)}
      />

      <Field
        label={shared('email')}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        // The address is typed once and is the account key; correcting a typo
        // costs a whole verification round trip on a slow link.
        spellCheck={false}
        required
        error={describeField(fieldRules.email)}
      />

      <Field
        label={shared('password')}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={shared('passwordHint', { min: formatNumber(PASSWORD_MIN_LENGTH, locale) })}
        error={describeField(fieldRules.password)}
      />

      <Button type="submit" size="lg" isLoading={mutation.isPending}>
        {mutation.isPending ? shared('workingOnIt') : t('submit')}
      </Button>
    </form>
  );
}
