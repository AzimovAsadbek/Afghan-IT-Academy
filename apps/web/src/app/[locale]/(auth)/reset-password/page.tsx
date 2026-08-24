import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AuthCard } from '@/components/auth/auth-card';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'auth.resetPassword' });

  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function ResetPasswordPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- see .claude/rules/i18n.md
  setRequestLocale(locale);

  const t = await getTranslations('auth.resetPassword');
  const common = await getTranslations('common');

  return (
    <AuthCard title={t('title')} subtitle={t('subtitle')}>
      {/* useSearchParams needs a Suspense boundary, or the whole route opts out
          of static rendering and the three locales stop being prerendered. */}
      <Suspense fallback={<p className="text-ink-700">{common('loading')}</p>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
