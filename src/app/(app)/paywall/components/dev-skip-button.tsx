'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';

export function DevSkipButton(): React.ReactElement {
  const t = useTranslations('Paywall');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      loading={isPending}
      onClick={() => {
        startTransition(async () => {
          const res = await fetch('/api/billing/dev-paywall-skip', {
            method: 'POST',
          });
          if (res.ok) router.replace('/dashboard');
        });
      }}
    >
      {t('devSkip')}
    </Button>
  );
}
