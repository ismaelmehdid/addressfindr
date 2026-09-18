'use client';

import { Check, Globe } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LOCALES, type Locale } from '@/i18n/locales';
import { requestLocaleChange } from '@/i18n/set-locale-request';

const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
};

const LOCALE_SHORT: Record<Locale, string> = {
  fr: 'FR',
  en: 'EN',
};

export function PublicLanguageSwitcher() {
  const router = useRouter();
  const current = useLocale() as Locale;
  const [isPending, startTransition] = useTransition();

  const handleSelect = (locale: Locale): void => {
    if (locale === current) return;
    startTransition(async () => {
      await requestLocaleChange(locale);
      router.refresh();
    });
  };

  return (
    <div className="fixed right-4 top-4 z-50">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              className="h-8 gap-1.5 rounded-md px-2 text-xs"
            />
          }
        >
          <Globe className="size-3.5" />
          {LOCALE_SHORT[current]}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {LOCALES.map((locale) => (
            <DropdownMenuItem
              key={locale}
              onClick={() => handleSelect(locale)}
              className="flex items-center justify-between"
            >
              <span>{LOCALE_LABELS[locale]}</span>
              {locale === current && (
                <Check className="size-3.5 text-charcoal" strokeWidth={2} />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
