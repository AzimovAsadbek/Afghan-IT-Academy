'use client';

import { PASSWORD_MIN_LENGTH } from '@afghan-it-academy/shared/policy';
import { Alert, Button, Field } from '@afghan-it-academy/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

import { useRouter } from '@/i18n/navigation';
import {
  changePassword,
  fetchCurrentUser,
  fetchSessions,
  logout,
  revokeOtherSessions,
  revokeSession,
} from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { fieldRulesFrom, useErrorMessage, useFieldErrorMessage } from '@/lib/use-error-message';
import { collectErrors, validatePassword, validateRequired } from '@/lib/validation';
import { formDataOf, readField, type FormSubmitEvent } from '@/lib/form';

const SESSIONS_KEY = ['sessions'];
const ME_KEY = ['me'];

export function AccountPanel() {
  const t = useTranslations('auth.account');
  const shared = useTranslations('auth.shared');
  const common = useTranslations('common');
  const describeError = useErrorMessage();
  const describeField = useFieldErrorMessage();
  const format = useFormatter();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [fieldRules, setFieldRules] = useState<Record<string, string>>({});
  const [passwordChanged, setPasswordChanged] = useState(false);

  const me = useQuery({ queryKey: ME_KEY, queryFn: fetchCurrentUser, retry: false });
  const sessions = useQuery({ queryKey: SESSIONS_KEY, queryFn: fetchSessions, retry: false });

  const signOut = useMutation({
    mutationFn: logout,
    // Even a failed logout must land the user on a signed-out screen: the API
    // clears the cookies regardless, so staying here would show an
    // authenticated page backed by a dead session.
    onSettled: () => {
      queryClient.clear();
      router.replace('/login');
    },
  });

  const revokeOne = useMutation({
    mutationFn: revokeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });

  const revokeOthers = useMutation({
    mutationFn: revokeOtherSessions,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });

  const password = useMutation({
    mutationFn: changePassword,
    onError: (error) => {
      setFieldRules(fieldRulesFrom(error));
      setPasswordChanged(false);
    },
    onSuccess: () => {
      setFieldRules({});
      setPasswordChanged(true);
      // Changing the password signs every other device out, so the list is
      // stale the moment this returns.
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
  });

  function handlePasswordChange(event: FormSubmitEvent) {
    event.preventDefault();
    const form = formDataOf(event);

    const currentPassword = readField(form, 'currentPassword');
    const newPassword = readField(form, 'newPassword');

    const local = collectErrors({
      currentPassword: validateRequired(currentPassword),
      newPassword: validatePassword(newPassword),
    });

    setFieldRules(local);
    if (Object.keys(local).length > 0) return;

    password.mutate({ currentPassword, newPassword });
  }

  // An expired session is the expected way to arrive here without credentials,
  // not an error worth rendering.
  if (me.isError && me.error instanceof ApiError && me.error.status === 401) {
    router.replace('/login');
    return null;
  }

  if (me.isPending) return <p className="text-ink-700">{common('loading')}</p>;
  if (me.isError) return <Alert tone="error">{describeError(me.error)}</Alert>;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <p className="text-ink-700">{t('signedInAs', { email: me.data.email })}</p>
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              signOut.mutate();
            }}
            isLoading={signOut.isPending}
          >
            {t('signOut')}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-ink-900 text-lg font-semibold">{t('changePassword')}</h2>

        <form onSubmit={handlePasswordChange} noValidate className="flex flex-col gap-4">
          {password.isError && <Alert tone="error">{describeError(password.error)}</Alert>}
          {passwordChanged && <Alert tone="success">{t('passwordChanged')}</Alert>}

          <Field
            label={shared('currentPassword')}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            error={describeField(fieldRules.currentPassword)}
          />

          <Field
            label={shared('newPassword')}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            hint={shared('passwordHint', { min: PASSWORD_MIN_LENGTH })}
            error={describeField(fieldRules.newPassword)}
          />

          <Button type="submit" isLoading={password.isPending}>
            {password.isPending ? shared('workingOnIt') : t('changePassword')}
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-ink-900 text-lg font-semibold">{t('sessionsTitle')}</h2>

        {sessions.isPending && <p className="text-ink-700">{common('loading')}</p>}
        {sessions.isError && <Alert tone="error">{describeError(sessions.error)}</Alert>}

        {sessions.isSuccess && (
          <ul className="flex flex-col gap-3">
            {sessions.data.map((session) => (
              <li
                key={session.id}
                className="border-brand-100 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-ink-900 font-medium">
                    {session.userAgent ?? t('unknownDevice')}
                    {session.isCurrent && (
                      <span className="text-brand-700 ms-2 text-sm">({t('currentSession')})</span>
                    )}
                  </span>
                  <span className="text-ink-700 text-sm">
                    {t('lastSeen', {
                      // Intl via next-intl, so Dari and Pashto render in the
                      // arabext numbering system rather than Latin digits.
                      when: format.dateTime(new Date(session.lastSeenAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                    })}
                  </span>
                </div>

                {!session.isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      revokeOne.mutate(session.id);
                    }}
                    isLoading={revokeOne.isPending && revokeOne.variables === session.id}
                  >
                    {t('revoke')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {sessions.isSuccess && sessions.data.every((session) => session.isCurrent) && (
          <p className="text-ink-700">{t('sessionsEmpty')}</p>
        )}

        <div>
          <Button
            variant="secondary"
            onClick={() => {
              revokeOthers.mutate();
            }}
            isLoading={revokeOthers.isPending}
          >
            {t('revokeOthers')}
          </Button>
        </div>

        {revokeOthers.isSuccess && (
          <Alert tone="success">{t('revokedOthers', { count: revokeOthers.data.revoked })}</Alert>
        )}
      </section>
    </div>
  );
}
