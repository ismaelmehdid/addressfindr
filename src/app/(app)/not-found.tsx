import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function AppNotFound(): React.ReactElement {
  const t = useTranslations('Errors');

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-base font-semibold">{t('notFoundTitle')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {t('notFoundDescription')}
      </p>
      <Button render={<Link href="/dashboard" />}>{t('backDashboard')}</Button>
    </main>
  );
}
