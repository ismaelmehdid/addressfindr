import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/application/me/get-current-user';
import { auth } from '@/infra/auth/auth';
import { AcceptInvitationContent } from './components/accept-invitation-content';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Meta');
  return { title: t('acceptInvitation') };
}

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AcceptInvitationPage({
  params,
}: Props): Promise<React.ReactElement> {
  const { id } = await params;

  const me = await getCurrentUser();
  if (me.isErr()) {
    redirect(`/sign-in?invitation=${encodeURIComponent(id)}`);
  }
  if (me.value.organizationId) {
    redirect(`/dashboard?toast=invitation-already-in-org`);
  }

  let invitation: Awaited<ReturnType<typeof auth.api.getInvitation>> | null =
    null;
  try {
    invitation = await auth.api.getInvitation({
      query: { id },
      headers: await headers(),
    });
  } catch {
    invitation = null;
  }

  return (
    <AcceptInvitationContent
      invitationId={id}
      invitation={
        invitation
          ? {
              email: invitation.email,
              role:
                invitation.role === 'admin' || invitation.role === 'owner'
                  ? invitation.role
                  : 'member',
              organizationName: invitation.organizationName ?? '',
              expiresAt:
                invitation.expiresAt instanceof Date
                  ? invitation.expiresAt.toISOString()
                  : new Date(invitation.expiresAt).toISOString(),
              status: invitation.status,
            }
          : null
      }
      currentUserEmail={me.value.email}
    />
  );
}
