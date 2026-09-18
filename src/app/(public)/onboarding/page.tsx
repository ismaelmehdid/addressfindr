import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { findPendingInvitationForCurrentUser } from '@/application/invitations/find-pending-for-current-user';
import { getCurrentUser } from '@/application/me/get-current-user';
import { OnboardingForm } from './components/onboarding-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Meta');
  return { title: t('onboarding') };
}

export default async function OnboardingPage(): Promise<React.ReactElement> {
  const currentUser = await getCurrentUser();
  if (currentUser.isErr()) redirect('/sign-in');
  if (currentUser.value.organizationId) redirect('/dashboard');
  const pending = await findPendingInvitationForCurrentUser();
  if (pending) {
    redirect(`/accept-invitation/${encodeURIComponent(pending.id)}`);
  }
  return <OnboardingForm />;
}
