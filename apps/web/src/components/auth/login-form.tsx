'use client';

import { Alert, Button, Field } from '@afghan-it-academy/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useRouter } from '@/i18n/navigation';
import { login } from '@/lib/api/auth';
import { fieldRulesFrom, useErrorMessage, useFieldErrorMessage } from '@/lib/use-error-message';
import { collectErrors, validateEmail, validateRequired } from '@/lib/validation';
import { formDataOf, readField, type FormSubmitEvent } from '@/lib/form';

export function LoginForm() {
  const t = useTranslations('auth.login');
  const shared = useTranslations('auth.shared');
  const describeError = useErrorMessage();
  const describeField = useFieldErrorMessage();
  const router = useRouter();

  const [fieldRules, setFieldRules] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: login,
    onError: (error) => {
      setFieldRules(fieldRulesFrom(error));
    },
    onSuccess: () => {
      // replace(), not push(): the sign-in page must not sit in history behind
      // an authenticated page, where Back would show a stale form.
      router.replace('/account');
    },
  });

  function handleSubmit(event: FormSubmitEvent) {
    event.preventDefault();
    const form = formDataOf(event);

    const email = readField(form, 'email');
    const password = readField(form, 'password');

    const local = collectErrors({
      email: validateEmail(email),
      // Only presence: an existing password may predate the current policy, and
      // rejecting it here would block the owner from the account they are
      // trying to reach in order to change it.
      password: validateRequired(password),
    });

    setFieldRules(local);
    if (Object.keys(local).length > 0) return;

    mutation.mutate({ email, password });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {mutation.isError && <Alert tone="error">{describeError(mutation.error)}</Alert>}

      <Field
        label={shared('email')}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        spellCheck={false}
        required
        error={describeField(fieldRules.email)}
      />

      <Field
        label={shared('password')}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={describeField(fieldRules.password)}
      />

      <Button type="submit" size="lg" isLoading={mutation.isPending}>
        {mutation.isPending ? shared('workingOnIt') : t('submit')}
      </Button>
    </form>
  );
}
