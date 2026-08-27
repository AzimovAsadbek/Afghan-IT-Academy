'use client';

import { formatNumber, type Locale } from '@afghan-it-academy/shared/i18n';
import { PASSWORD_MIN_LENGTH } from '@afghan-it-academy/shared/policy';
import { Alert, Button, Field } from '@afghan-it-academy/ui';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Link } from '@/i18n/navigation';
import { resetPassword } from '@/lib/api/auth';
import { fieldRulesFrom, useErrorMessage, useFieldErrorMessage } from '@/lib/use-error-message';
import { collectErrors, validatePassword } from '@/lib/validation';
import { formDataOf, readField, type FormSubmitEvent } from '@/lib/form';

/**
 * The reset token arrives as a query parameter on the emailed link.
 *
 * `useSearchParams` rather than a server-side `searchParams` prop, deliberately:
 * reading it on the server would make this route dynamically rendered and put
 * the token into the server's request log. Here it stays in the browser and is
 * sent only in the POST body.
 */
export function ResetPasswordForm() {
  const t = useTranslations('auth.resetPassword');
  const shared = useTranslations('auth.shared');
  const describeError = useErrorMessage();
  const describeField = useFieldErrorMessage();
  const locale = useLocale() as Locale;

  const token = useSearchParams().get('token');
  const [fieldRules, setFieldRules] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: resetPassword,
    onError: (error) => {
      setFieldRules(fieldRulesFrom(error));
    },
  });

  function handleSubmit(event: FormSubmitEvent) {
    event.preventDefault();
    if (token === null) return;

    const newPassword = readField(formDataOf(event), 'newPassword');

    const local = collectErrors({ newPassword: validatePassword(newPassword) });
    setFieldRules(local);
    if (Object.keys(local).length > 0) return;

    mutation.mutate({ token, newPassword });
  }

  if (token === null) {
    return <Alert tone="error">{t('missingToken')}</Alert>;
  }

  if (mutation.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{t('done')}</Alert>
        <Link href="/login" className="text-brand-700 font-medium underline">
          {t('signIn')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {mutation.isError && <Alert tone="error">{describeError(mutation.error)}</Alert>}

      <Field
        label={shared('newPassword')}
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        hint={shared('passwordHint', { min: formatNumber(PASSWORD_MIN_LENGTH, locale) })}
        error={describeField(fieldRules.newPassword)}
      />

      <Button type="submit" size="lg" isLoading={mutation.isPending}>
        {mutation.isPending ? shared('workingOnIt') : t('submit')}
      </Button>
    </form>
  );
}
