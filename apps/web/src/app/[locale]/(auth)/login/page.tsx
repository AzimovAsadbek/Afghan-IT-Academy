import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';

import { AuthCard } from '@/components/auth/auth-card';
import { LoginForm } from '@/components/auth/login-form';
import { Link } from '@/i18n/navigation';

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'auth.login' });

  return { title: t('title'), robots: { index: false, follow: true } };
}

export default async function LoginPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- see .claude/rules/i18n.md
  setRequestLocale(locale);

  const t = await getTranslations('auth.login');

  return (
    <AuthCard
      title={t('title')}
      subtitle={t('subtitle')}
      footer={
        <div className="flex flex-col gap-2">
          <Link href="/forgot-password" className="text-brand-700 font-medium underline">
            {t('forgotPassword')}
          </Link>
          <span>
            {t('noAccount')}{' '}
            <Link href="/register" className="text-brand-700 font-medium underline">
              {t('createAccount')}
            </Link>
          </span>
        </div>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
