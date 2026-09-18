import type { Metadata } from 'next';
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
  const [me, sessionsResult, accountsResult] = await Promise.all([
    getCurrentUser(),
    listUserSessions(),
    listLinkedAccounts(),
  ]);

  const user = me.isOk()
    ? {
        firstName: me.value.firstName,
        lastName: me.value.lastName,
        email: me.value.email,
        image: me.value.image,
        currentSessionId: me.value.sessionId,
      }
    : {
        firstName: '',
        lastName: '',
        email: '',
        image: null,
        currentSessionId: '',
      };

  return (
    <SettingsContent
      user={user}
      initialSessions={sessionsResult.isOk() ? sessionsResult.value : []}
      initialAccounts={accountsResult.isOk() ? accountsResult.value : []}
    />
  );
}
