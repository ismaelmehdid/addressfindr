import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/application/me/get-current-user';
import { OnboardingForm } from './components/onboarding-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Meta');
  return { title: t('onboarding') };
}

export default async function OnboardingPage(): Promise<React.ReactElement> {
  const currentUser = await getCurrentUser();
  if (currentUser.isErr()) redirect('/sign-in');
  if (currentUser.value.hasRedeemedAccess) redirect('/dashboard');
  return <OnboardingForm />;
}
