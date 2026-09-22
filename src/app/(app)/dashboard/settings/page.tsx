import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/application/me/get-current-user';
import { listLinkedAccounts } from '@/application/settings/list-accounts';
import { listUserSessions } from '@/application/settings/list-sessions';
import { SettingsContent } from './components/settings-content';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Meta');
  return { title: t('settings') };
}

export default async function SettingsPage(): Promise<React.ReactElement> {
  const me = await getCurrentUser();
  // why: the middleware already redirects, but settings must not render for an
  // anonymous visitor if that redirect ever stops running.
  if (me.isErr()) redirect('/sign-in');

  const [sessionsResult, accountsResult] = await Promise.all([
    listUserSessions(),
    listLinkedAccounts(),
  ]);

  return (
    <SettingsContent
      user={{
        firstName: me.value.firstName,
        lastName: me.value.lastName,
        email: me.value.email,
        image: me.value.image,
        currentSessionId: me.value.sessionId,
      }}
      initialSessions={sessionsResult.isOk() ? sessionsResult.value : []}
      initialAccounts={accountsResult.isOk() ? accountsResult.value : []}
    />
  );
}
