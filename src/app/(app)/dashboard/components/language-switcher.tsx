'use client';

import { Check, Globe } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { LOCALES, type Locale } from '@/i18n/locales';
import { requestLocaleChange } from '@/i18n/set-locale-request';

const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
};

export function LanguageSwitcher() {
  const t = useTranslations('Nav');
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
    <DropdownMenu>
      <Tooltip>
        <DropdownMenuTrigger
          render={
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  data-help-id="sidebar.language-switcher"
                  aria-label={t('language')}
                  loading={isPending}
                />
              }
            />
          }
        >
          <Globe className="size-4" />
        </DropdownMenuTrigger>
        <TooltipContent side="right">{t('language')}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" side="top" className="w-40">
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
  );
}
