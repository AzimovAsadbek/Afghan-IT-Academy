'use client';

import { Alert, Button, Field } from '@afghan-it-academy/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Link } from '@/i18n/navigation';
import { resendVerification, verifyEmail } from '@/lib/api/auth';
import { formDataOf, readField, type FormSubmitEvent } from '@/lib/form';
import { useErrorMessage, useFieldErrorMessage } from '@/lib/use-error-message';
import { collectErrors, validateEmail } from '@/lib/validation';

type VerificationState = 'verifying' | 'verified' | 'failed';

export function VerifyEmailPanel() {
  const t = useTranslations('auth.verifyEmail');
  const shared = useTranslations('auth.shared');
  const describeError = useErrorMessage();
  const describeField = useFieldErrorMessage();

  const token = useSearchParams().get('token');

  const [state, setState] = useState<VerificationState>(token === null ? 'failed' : 'verifying');

  /**
   * The verification request, started at most once.
   *
   * The token is single-use, so firing the request twice consumes it on the
   * first call and reports the second as invalid. That is not hypothetical:
   * React Strict Mode mounts, unmounts and remounts every component in
   * development, running this effect twice.
   *
   * Holding the *promise* rather than an "already fired" flag is what makes
   * this correct. A flag stops the second request but leaves the remounted
   * component with no way to observe the first one's result — the screen sits
   * on "checking your link" forever while the network tab plainly shows the
   * response arrived. Subscribing every mount to the same promise fixes both
   * halves, and it was the flag version that shipped first and had to be
   * caught in a browser.
   */
  const request = useRef<Promise<VerificationState> | null>(null);

  useEffect(() => {
    if (token === null) return;

    request.current ??= verifyEmail(token).then(
      () => 'verified' as const,
      // A wrong, expired and already-consumed token are deliberately
      // indistinguishable here, because the API refuses to distinguish them.
      () => 'failed' as const,
    );

    let active = true;
    void request.current.then((result) => {
      if (active) setState(result);
    });

    return () => {
      active = false;
    };
  }, [token]);

  const resend = useMutation({ mutationFn: resendVerification });
  const [emailRule, setEmailRule] = useState<string | undefined>(undefined);

  function handleResend(event: FormSubmitEvent) {
    event.preventDefault();
    const email = readField(formDataOf(event), 'email');

    const local = collectErrors({ email: validateEmail(email) });
    setEmailRule(local.email);
    if (local.email !== undefined) return;

    resend.mutate(email);
  }

  if (state === 'verifying') {
    return <Alert tone="info">{t('verifying')}</Alert>;
  }

  if (state === 'verified') {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{t('verified')}</Alert>
        <Link href="/login" className="text-brand-700 font-medium underline">
          {t('signIn')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Alert tone="error">{token === null ? t('missingToken') : t('failed')}</Alert>

      <form onSubmit={handleResend} noValidate className="flex flex-col gap-4">
        <h2 className="text-ink-900 text-lg font-semibold">{t('resendTitle')}</h2>

        {resend.isError && <Alert tone="error">{describeError(resend.error)}</Alert>}
        {resend.isSuccess && <Alert tone="success">{t('resent')}</Alert>}

        <Field
          label={shared('email')}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          required
          error={describeField(emailRule)}
        />

        <Button type="submit" size="lg" isLoading={resend.isPending}>
          {resend.isPending ? shared('workingOnIt') : t('resend')}
        </Button>
      </form>
    </div>
  );
}
