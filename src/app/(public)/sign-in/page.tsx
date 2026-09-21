import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/application/me/get-current-user';
import { isMicrosoftAuthEnabled } from '@/infra/auth/auth';
import { SignInForm } from './components/sign-in-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Meta');
  return { title: t('signIn') };
}

export default async function SignInPage(): Promise<React.ReactElement> {
  const currentUser = await getCurrentUser();
  if (currentUser.isOk()) redirect('/dashboard');
  return <SignInForm microsoftEnabled={isMicrosoftAuthEnabled} />;
}
