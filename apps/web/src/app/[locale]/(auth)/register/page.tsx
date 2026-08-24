import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';

import { AuthCard } from '@/components/auth/auth-card';
import { RegisterForm } from '@/components/auth/register-form';
import { Link } from '@/i18n/navigation';

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'auth.register' });

  // Sign-up and sign-in pages carry no unique content worth indexing, and an
  // indexed auth page competes with the marketing route for the same query.
  return { title: t('title'), robots: { index: false, follow: true } };
}

export default async function RegisterPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- see .claude/rules/i18n.md
  setRequestLocale(locale);

  const t = await getTranslations('auth.register');

  return (
    <AuthCard
      title={t('title')}
      subtitle={t('subtitle')}
      footer={
        <span>
          {t('haveAccount')}{' '}
          <Link href="/login" className="text-brand-700 font-medium underline">
            {t('signIn')}
          </Link>
        </span>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
