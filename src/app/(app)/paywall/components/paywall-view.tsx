'use client';

import { AutumnProvider, useCustomer } from 'autumn-js/react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DevSkipButton } from './dev-skip-button';

// Must match the paid plan id in autumn.config.ts.
const PRO_PLAN_ID = 'pro';

function UpgradeButton(): React.ReactElement {
  const t = useTranslations('Paywall');
  const { attach } = useCustomer();
  const [isPending, setIsPending] = useState(false);

  return (
    <Button
      type="button"
      loading={isPending}
      onClick={async () => {
        setIsPending(true);
        try {
          // Redirects to Stripe checkout when payment is required.
          await attach({ planId: PRO_PLAN_ID });
        } finally {
          setIsPending(false);
        }
      }}
    >
      {t('upgrade')}
    </Button>
  );
}

export function PaywallView({
  showDevSkip,
}: {
  showDevSkip: boolean;
}): React.ReactElement {
  const t = useTranslations('Paywall');

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6">
      <Image
        src="/logo.svg"
        alt=""
        width={64}
        height={64}
        className="rounded-md"
        aria-hidden
        priority
      />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            {t('title')}
          </CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AutumnProvider>
            <UpgradeButton />
          </AutumnProvider>
          {showDevSkip ? <DevSkipButton /> : null}
        </CardContent>
      </Card>
    </main>
  );
}
