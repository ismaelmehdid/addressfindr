'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { authClient } from '@/shared/auth-client';

const CALLBACK_URL = '/onboarding';

type Props = {
  microsoftEnabled: boolean;
};

export function SignInForm({ microsoftEnabled }: Props) {
  const t = useTranslations('SignIn');

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
                  callbackURL: CALLBACK_URL,
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
                    callbackURL: CALLBACK_URL,
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
