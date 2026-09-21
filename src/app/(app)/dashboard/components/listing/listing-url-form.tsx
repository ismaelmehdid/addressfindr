'use client';

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import * as v from 'valibot';
import { ExtractedListingSchema } from '@/application/listing/dto';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  EXTRACTED_FIELD_NAMES,
  type ExtractedListing,
} from '@/core/listing/types';
import {
  type ListingUrlRejection,
  validateListingUrl,
} from '@/core/listing/validate-listing-url';

const REJECTION_KEY = {
  empty: 'errorEmpty',
  malformed: 'errorMalformed',
  'unsupported-portal': 'errorUnsupportedPortal',
} as const satisfies Record<ListingUrlRejection, string>;

type ExtractionFailure =
  | 'not-extractable'
  | 'rate-limited'
  | 'signed-out'
  | 'unknown';

const FAILURE_KEY = {
  'not-extractable': 'errorNotExtractable',
  'rate-limited': 'errorRateLimited',
  'signed-out': 'errorSignedOut',
  unknown: 'errorUnknown',
} as const satisfies Record<ExtractionFailure, string>;

type Status =
  | { kind: 'idle' }
  | { kind: 'rejected'; reason: ListingUrlRejection }
  | { kind: 'pending' }
  | { kind: 'failed'; failure: ExtractionFailure }
  | { kind: 'extracted'; listing: ExtractedListing };

type ExtractionOutcome =
  | { ok: true; listing: ExtractedListing }
  | { ok: false; failure: ExtractionFailure };

function toFailure(body: unknown): ExtractionFailure {
  const code =
    typeof body === 'object' && body !== null && 'error' in body
      ? (body as { error: unknown }).error
      : null;
  if (code === 'validation') return 'not-extractable';
  if (code === 'rate_limited') return 'rate-limited';
  if (code === 'unauthorized' || code === 'forbidden') return 'signed-out';
  return 'unknown';
}

async function requestExtraction(url: string): Promise<ExtractionOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/listings/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  } catch {
    return { ok: false, failure: 'unknown' };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, failure: 'unknown' };
  }

  if (!response.ok) return { ok: false, failure: toFailure(body) };

  const parsed = v.safeParse(ExtractedListingSchema, body);
  if (!parsed.success) return { ok: false, failure: 'unknown' };
  return { ok: true, listing: parsed.output };
}

const NAME_WIDTH = 16;
const VALUE_WIDTH = 24;

function formatExtraction(listing: ExtractedListing): string {
  const header = [
    `${'portal'.padEnd(NAME_WIDTH)}${listing.fields.portal}`,
    `${'canonicalUrl'.padEnd(NAME_WIDTH)}${listing.fields.canonicalUrl}`,
  ];
  const rows = EXTRACTED_FIELD_NAMES.map((name) => {
    const value = listing.fields[name];
    const printed = value === null ? 'null' : String(value);
    return `${name.padEnd(NAME_WIDTH)}${printed.padEnd(VALUE_WIDTH)}${listing.sources[name]}`;
  });
  return [...header, '', ...rows].join('\n');
}

export function ListingUrlForm() {
  const t = useTranslations('Listing');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (status.kind === 'pending') return;

    const validated = validateListingUrl(url);
    if (!validated.ok) {
      setStatus({ kind: 'rejected', reason: validated.reason });
      return;
    }

    setStatus({ kind: 'pending' });
    const outcome = await requestExtraction(validated.canonicalUrl);
    setStatus(
      outcome.ok
        ? { kind: 'extracted', listing: outcome.listing }
        : { kind: 'failed', failure: outcome.failure },
    );
  }

  const isRejected = status.kind === 'rejected';
  const isFailed = status.kind === 'failed';
  const message = isRejected
    ? t(REJECTION_KEY[status.reason])
    : isFailed
      ? t(FAILURE_KEY[status.failure])
      : status.kind === 'pending'
        ? t('analyzing')
        : null;

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-8">
      <div className="w-full max-w-xl">
        <h1 className="text-center text-[22px] font-semibold leading-[1.3] tracking-[-0.18px] text-ink">
          {t('heading')}
        </h1>
        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          className="mt-6 flex items-start gap-2"
        >
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
              aria-invalid={isRejected || isFailed}
              aria-describedby={
                message === null ? undefined : 'listing-url-status'
              }
              className="h-9"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            loading={status.kind === 'pending'}
            className="h-9 shrink-0"
          >
            {t('submit')}
            <ArrowRight className="size-3.5" />
          </Button>
        </form>
        {message !== null && (
          <p
            id="listing-url-status"
            aria-live="polite"
            className={
              isRejected || isFailed
                ? 'mt-2 text-[13px] tracking-[-0.08px] text-destructive'
                : 'mt-2 text-[13px] tracking-[-0.08px] text-slate-neutral'
            }
          >
            {message}
          </p>
        )}
        {status.kind === 'extracted' && (
          <section aria-live="polite" className="mt-6">
            <h2 className="text-[13px] font-medium tracking-[-0.08px] text-slate-neutral">
              {t('resultHeading')}
            </h2>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-card p-3 font-mono text-[12px] leading-[1.6] text-ink">
              {formatExtraction(status.listing)}
            </pre>
          </section>
        )}
      </div>
    </div>
  );
}
