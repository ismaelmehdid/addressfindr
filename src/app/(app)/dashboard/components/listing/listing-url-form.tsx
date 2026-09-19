'use client';

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  type ListingUrlRejection,
  validateListingUrl,
} from '@/core/listing/validate-listing-url';

const ERROR_KEY = {
  empty: 'errorEmpty',
  malformed: 'errorMalformed',
  'unsupported-portal': 'errorUnsupportedPortal',
} as const satisfies Record<ListingUrlRejection, string>;

type Status =
  | { kind: 'idle' }
  | { kind: 'rejected'; reason: ListingUrlRejection }
  | { kind: 'accepted'; canonicalUrl: string };

export function ListingUrlForm() {
  const t = useTranslations('Listing');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = validateListingUrl(url);
    setStatus(
      result.ok
        ? { kind: 'accepted', canonicalUrl: result.canonicalUrl }
        : { kind: 'rejected', reason: result.reason },
    );
  }

  const isRejected = status.kind === 'rejected';

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <h1 className="text-center text-[22px] font-semibold leading-[1.3] tracking-[-0.18px] text-ink">
          {t('heading')}
        </h1>
        <form onSubmit={handleSubmit} className="mt-6 flex items-start gap-2">
          <div className="flex-1">
            <Input
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setStatus({ kind: 'idle' });
              }}
              placeholder={t('placeholder')}
              aria-invalid={isRejected}
              aria-describedby={
                status.kind === 'idle' ? undefined : 'listing-url-status'
              }
              className="h-9"
            />
          </div>
          <Button type="submit" size="sm" className="h-9 shrink-0">
            {t('submit')}
            <ArrowRight className="size-3.5" />
          </Button>
        </form>
        {status.kind !== 'idle' && (
          <p
            id="listing-url-status"
            aria-live="polite"
            className={
              isRejected
                ? 'mt-2 text-[13px] tracking-[-0.08px] text-destructive'
                : 'mt-2 text-[13px] tracking-[-0.08px] text-slate-neutral'
            }
          >
            {isRejected ? t(ERROR_KEY[status.reason]) : t('notAvailable')}
          </p>
        )}
      </div>
    </div>
  );
}
