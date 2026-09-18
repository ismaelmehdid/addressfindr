import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/application/me/get-current-user';
import { listOrganizationInvitations } from '@/application/organization/list-invitations';
import { listOrganizationMembers } from '@/application/organization/list-members';
import { OrganizationPageContent } from './components/organization-page-content';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Meta');
  return { title: t('organization') };
}

export default async function OrganizationPage(): Promise<React.ReactElement> {
  const me = await getCurrentUser();
  const currentEmail = me.isOk() ? me.value.email : '';
  const currentUserId = me.isOk() ? me.value.id : '';
  const organizationId = me.isOk() ? (me.value.organizationId ?? '') : '';

  const [membersResult, invitationsResult] = await Promise.all([
    listOrganizationMembers(),
    listOrganizationInvitations(),
  ]);

  return (
    <OrganizationPageContent
      currentUserId={currentUserId}
      currentEmail={currentEmail}
      organizationId={organizationId}
      initialMembers={membersResult.isOk() ? membersResult.value : []}
      initialInvitations={
        invitationsResult.isOk() ? invitationsResult.value : []
      }
    />
  );
}
