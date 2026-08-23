import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';

import { AccountPanel } from '@/components/auth/account-panel';

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'auth.account' });

  // Never indexed: it is per-user and requires a session to render anything.
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * Account security.
 *
 * The shell is prerendered like every other route; the panel fetches the user
 * and their sessions client-side with the session cookie. Rendering it on the
 * server would mean forwarding the cookie from the Next server to the API on
 * every request — a second hop, and a second place a credential travels — for
 * a page the user reaches rarely.
 *
 * The authorization consequence is nil either way: `/v1/me` and
 * `/v1/me/sessions` are enforced server-side by the API. This page renders
 * nothing it was not handed.
 */
export default async function AccountPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- see .claude/rules/i18n.md
  setRequestLocale(locale);

  const t = await getTranslations('auth.account');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-5 py-12">
      <h1 className="text-ink-900 text-2xl font-bold">{t('title')}</h1>
      <AccountPanel />
    </main>
  );
}
