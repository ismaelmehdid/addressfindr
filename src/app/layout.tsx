import './globals.css';

import { Inter, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PostHogProvider } from '@/components/posthog-provider';
import { Toaster } from '@/components/ui/sonner';
import { VersionGuard } from '@/components/version-guard';
import { cn } from '@/lib/utils';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
  display: 'swap',
});

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html
      lang={locale}
      className={cn('font-sans', inter.variable, jetbrainsMono.variable)}
    >
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <PostHogProvider>
            <VersionGuard />
            {children}
            <Toaster position="bottom-right" />
          </PostHogProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
