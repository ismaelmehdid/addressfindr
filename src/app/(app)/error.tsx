'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ reset }: Props): React.ReactElement {
  const t = useTranslations('Errors');

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-base font-semibold">{t('title')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {t('description')}
      </p>
      <Button onClick={reset}>{t('retry')}</Button>
    </main>
  );
}
