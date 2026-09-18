'use client';

import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { authClient } from '@/shared/auth-client';

const DEFAULT_CALLBACK_URL = '/onboarding';
const INVITATION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

type Props = {
  microsoftEnabled: boolean;
};

export function SignInForm({ microsoftEnabled }: Props) {
  const t = useTranslations('SignIn');
  const searchParams = useSearchParams();
  const invitationParam = searchParams.get('invitation') ?? '';
  const hasValidInvitation = INVITATION_ID_PATTERN.test(invitationParam);
  const callbackURL = hasValidInvitation
    ? `/accept-invitation/${invitationParam}`
    : DEFAULT_CALLBACK_URL;

  const errorParam = searchParams.get('error');

  useEffect(() => {
    if (errorParam === 'invitation-email-mismatch') {
      const id = window.setTimeout(() => {
        toast.error(t('emailMismatchToast'));
      }, 0);
      return () => window.clearTimeout(id);
    }
    if (hasValidInvitation) {
      const id = window.setTimeout(() => {
        toast.info(t('signInToAcceptInvitation'));
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [errorParam, hasValidInvitation, t]);

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
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            {t('title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                authClient.signIn.social({
                  provider: 'google',
                  callbackURL,
                })
              }
            >
              <Image
                src="/google_logo.svg"
                alt=""
                width={16}
                height={16}
                aria-hidden
              />
              {t('google')}
            </Button>
            {microsoftEnabled ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  authClient.signIn.social({
                    provider: 'microsoft',
                    callbackURL,
                  })
                }
              >
                <Image
                  src="/microsoft_logo.svg"
                  alt=""
                  width={16}
                  height={16}
                  aria-hidden
                />
                {t('microsoft')}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
