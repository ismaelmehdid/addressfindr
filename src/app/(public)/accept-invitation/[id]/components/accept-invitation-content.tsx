'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { authClient } from '@/shared/auth-client';

type InvitationView = {
  email: string;
  role: 'owner' | 'admin' | 'member';
  organizationName: string;
  expiresAt: string;
  status: string;
};

type Props = {
  invitationId: string;
  invitation: InvitationView | null;
  currentUserEmail: string;
};

export function AcceptInvitationContent({
  invitationId,
  invitation,
  currentUserEmail,
}: Props) {
  const t = useTranslations('AcceptInvitation');
  const tMembers = useTranslations('Members');
  const tErrors = useTranslations('Errors');
  const router = useRouter();
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'invitation-email-mismatch') {
      const id = window.setTimeout(() => {
        toast.error(t('emailMismatchToast'));
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [t]);

  const onAccept = (): void => {
    startTransition(async () => {
      const res = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (res.error) {
        toast.error(tErrors('description'));
        return;
      }
      toast.success(t('acceptSuccess'));
      router.replace('/dashboard');
    });
  };

  const onReject = (): void => {
    startTransition(async () => {
      const res = await authClient.organization.rejectInvitation({
        invitationId,
      });
      if (res.error) {
        toast.error(tErrors('description'));
        return;
      }
      toast.success(t('rejectSuccess'));
      router.replace('/');
    });
  };

  const onSwitchAccount = (): void => {
    startTransition(async () => {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            window.location.href = `/sign-in?invitation=${encodeURIComponent(invitationId)}&error=invitation-email-mismatch`;
          },
        },
      });
    });
  };

  let body: React.ReactNode;

  if (!invitation) {
    body = <p className="text-sm text-slate-neutral">{t('notFound')}</p>;
  } else if (invitation.status !== 'pending') {
    body = <p className="text-sm text-slate-neutral">{t('alreadyMember')}</p>;
  } else if (new Date(invitation.expiresAt) < new Date()) {
    body = <p className="text-sm text-slate-neutral">{t('expired')}</p>;
  } else if (
    invitation.email.toLowerCase() !== currentUserEmail.toLowerCase()
  ) {
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-neutral">
          {t('wrongAccount', {
            email: invitation.email,
            currentEmail: currentUserEmail,
          })}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={onSwitchAccount}
          loading={isPending}
        >
          {t('switchAccount')}
        </Button>
      </div>
    );
  } else {
    const roleLabel =
      invitation.role === 'admin'
        ? tMembers('roleAdmin')
        : tMembers('roleMember');
    const expiresLabel = new Intl.DateTimeFormat(
      locale === 'fr' ? 'fr-FR' : 'en-US',
      { dateStyle: 'long' },
    ).format(new Date(invitation.expiresAt));
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink">
          {t('subtitle', {
            orgName: invitation.organizationName,
            role: roleLabel,
          })}
        </p>
        <p className="text-[12px] text-slate-neutral">
          {tMembers('expiresOn', { date: expiresLabel })}
        </p>
      </div>
    );
  }

  const showActions =
    invitation &&
    invitation.status === 'pending' &&
    new Date(invitation.expiresAt) >= new Date() &&
    invitation.email.toLowerCase() === currentUserEmail.toLowerCase();

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background">
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
          {invitation?.organizationName ? (
            <CardDescription>{invitation.organizationName}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>{body}</CardContent>
        {showActions ? (
          <CardFooter className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onReject}
              disabled={isPending}
            >
              {t('reject')}
            </Button>
            <Button type="button" onClick={onAccept} loading={isPending}>
              {t('accept')}
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </main>
  );
}
