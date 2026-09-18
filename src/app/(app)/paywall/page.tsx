import { redirect } from 'next/navigation';
import { getAppEntitlement } from '@/application/billing/get-app-entitlement';
import { env } from '@/shared/env';
import { PaywallView } from './components/paywall-view';

export default async function PaywallPage(): Promise<React.ReactElement> {
  const entitlement = await getAppEntitlement();
  if (entitlement.isOk() && entitlement.value.allowed) {
    redirect('/dashboard');
  }

  const showDevSkip = env().VERCEL_ENV !== 'production';
  return <PaywallView showDevSkip={showDevSkip} />;
}
