'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import posthog from 'posthog-js';
import { useState, useTransition } from 'react';
import type { RedeemResult } from '@/application/early-access/redeem';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// The route mirrors RedeemResult for every mapped outcome, but transport-level
// failures (rate limit, malformed body) answer with a different shape.
async function redeemEarlyAccess(input: {
  code: string;
  organizationName: string;
}): Promise<RedeemResult> {
  try {
    const res = await fetch('/api/early-access/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && 'success' in body) {
      return body as RedeemResult;
    }
    return { success: false, error: 'unknown' };
  } catch {
    return { success: false, error: 'unknown' };
  }
}

export function OnboardingForm() {
  const t = useTranslations('Onboarding');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (formData: FormData): void => {
    setError(null);
    startTransition(async () => {
      const result = await redeemEarlyAccess({
        organizationName: String(formData.get('orgName') ?? ''),
        code: String(formData.get('code') ?? ''),
      });

      if (result.success) {
        posthog.capture('onboarding_completed', {
          org_name: String(formData.get('orgName') ?? ''),
        });
        router.replace('/dashboard');
        return;
      }

      switch (result.error) {
        case 'invalid_code':
        case 'invalid_input':
          setError(t('invalidCode'));
          break;
        case 'unauthenticated':
          router.replace('/sign-in');
          break;
        case 'already_in_org':
          router.replace('/dashboard');
          break;
        default:
          setError(t('unknownError'));
      }
    });
  };

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
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="orgName">{t('orgName')}</Label>
              <Input
                id="orgName"
                name="orgName"
                required
                autoComplete="organization"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="code">{t('code')}</Label>
              <Input
                id="code"
                name="code"
                required
                autoComplete="off"
                className="font-mono tracking-wider"
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" loading={isPending}>
              {t('submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
