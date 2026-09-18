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

const INVITATION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string }>;
}): Promise<React.ReactElement> {
  const params = await searchParams;
  const invitation = params.invitation ?? '';
  const hasInvitation = INVITATION_ID_PATTERN.test(invitation);

  const currentUser = await getCurrentUser();
  if (currentUser.isOk()) {
    if (hasInvitation) {
      redirect(`/accept-invitation/${invitation}`);
    }
    redirect(currentUser.value.organizationId ? '/dashboard' : '/onboarding');
  }
  return <SignInForm microsoftEnabled={isMicrosoftAuthEnabled} />;
}
