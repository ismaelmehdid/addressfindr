import { redirect } from 'next/navigation';
import { findPendingInvitationForCurrentUser } from '@/application/invitations/find-pending-for-current-user';
import { getCurrentUser } from '@/application/me/get-current-user';

export default async function HomePage(): Promise<never> {
  const currentUser = await getCurrentUser();
  if (currentUser.isErr()) redirect('/sign-in');
  if (currentUser.value.organizationId) redirect('/dashboard');
  const pending = await findPendingInvitationForCurrentUser();
  if (pending) {
    redirect(`/accept-invitation/${encodeURIComponent(pending.id)}`);
  }
  redirect('/onboarding');
}
