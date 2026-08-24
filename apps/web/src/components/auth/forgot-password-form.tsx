'use client';

import { Alert, Button, Field } from '@afghan-it-academy/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { forgotPassword } from '@/lib/api/auth';
import { fieldRulesFrom, useErrorMessage, useFieldErrorMessage } from '@/lib/use-error-message';
import { collectErrors, validateEmail } from '@/lib/validation';
import { formDataOf, readField, type FormSubmitEvent } from '@/lib/form';

export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgotPassword');
  const shared = useTranslations('auth.shared');
  const describeError = useErrorMessage();
  const describeField = useFieldErrorMessage();

  const [fieldRules, setFieldRules] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: forgotPassword,
    onError: (error) => {
      setFieldRules(fieldRulesFrom(error));
    },
  });

  function handleSubmit(event: FormSubmitEvent) {
    event.preventDefault();
    const email = readField(formDataOf(event), 'email');

    const local = collectErrors({ email: validateEmail(email) });
    setFieldRules(local);
    if (Object.keys(local).length > 0) return;

    mutation.mutate(email);
  }

  // Same message whether or not the address exists. This endpoint needs no
  // credential at all, which makes it the easiest place in the system to
  // enumerate accounts.
  if (mutation.isSuccess) {
    return <Alert tone="success">{t('sent')}</Alert>;
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

      <Button type="submit" size="lg" isLoading={mutation.isPending}>
        {mutation.isPending ? shared('workingOnIt') : t('submit')}
      </Button>
    </form>
  );
}
