import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';

import { AuthCard } from '@/components/auth/auth-card';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { Link } from '@/i18n/navigation';

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'auth.forgotPassword' });

  return { title: t('title'), robots: { index: false, follow: true } };
}

export default async function ForgotPasswordPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- see .claude/rules/i18n.md
  setRequestLocale(locale);

  const t = await getTranslations('auth.forgotPassword');

  return (
    <AuthCard
      title={t('title')}
      subtitle={t('subtitle')}
      footer={
        <Link href="/login" className="text-brand-700 font-medium underline">
          {t('backToSignIn')}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
