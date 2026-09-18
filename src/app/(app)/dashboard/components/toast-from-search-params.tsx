'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { toast } from 'sonner';

export function ToastFromSearchParams(): null {
  const t = useTranslations('AcceptInvitation');
  const searchParams = useSearchParams();
  const toastKey = searchParams.get('toast');

  useEffect(() => {
    if (toastKey !== 'invitation-already-in-org') return;
    const id = window.setTimeout(() => {
      toast.info(t('alreadyInOrgToast'));
    }, 0);
    return () => window.clearTimeout(id);
  }, [toastKey, t]);

  return null;
}
