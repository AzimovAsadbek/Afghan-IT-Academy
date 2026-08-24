import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AuthCard } from '@/components/auth/auth-card';
import { VerifyEmailPanel } from '@/components/auth/verify-email-panel';

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'auth.verifyEmail' });

  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function VerifyEmailPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- see .claude/rules/i18n.md
  setRequestLocale(locale);

  const t = await getTranslations('auth.verifyEmail');
  const common = await getTranslations('common');

  return (
    <AuthCard title={t('title')}>
      <Suspense fallback={<p className="text-ink-700">{common('loading')}</p>}>
        <VerifyEmailPanel />
      </Suspense>
    </AuthCard>
  );
}
