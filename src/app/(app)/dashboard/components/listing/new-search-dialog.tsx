'use client';

import { ArrowRight, Search, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { SUSPENDS_DETAIL_SHORTCUTS } from './use-detail-shortcuts';
import {
  isSearching,
  type ListingSearch,
  linkMessage,
  searchMessage,
} from './use-listing-search';

// why: the search is owned above the results, which remount for each new
// result, so its progress can fade out over the new results. The dialog steps
// aside while the search runs and comes back with its link when the search
// fails or is cancelled.
export function NewSearchDialog({ search }: { search: ListingSearch }) {
  const t = useTranslations('Listing');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searching = isSearching(search.status);
  const message = searchMessage({
    status: search.status,
    rejection: search.rejection,
  });
  const linkInError =
    linkMessage({ status: search.status, rejection: search.rejection })
      ?.tone === 'error';

  // why: closing abandons the search in flight. Its answer must never replace
  // the results on screen, and the next opening starts from an empty field.
  function changeOpen(next: boolean): void {
    if (!next) search.reset();
    setOpen(next);
  }

  return (
    <Dialog open={open && !searching} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button variant="outline" className="w-full" />}>
        <Search />
        {t('resultsNewSearch')}
      </DialogTrigger>
      <DialogContent
        {...SUSPENDS_DETAIL_SHORTCUTS}
        showCloseButton={false}
        initialFocus={inputRef}
        // why: stepping aside for the search must not send focus to the
        // trigger, behind the progress overlay.
        finalFocus={() => !searching}
        className="sm:max-w-[480px]"
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{t('newSearchTitle')}</DialogTitle>
          <DialogDescription>{t('newSearchDescription')}</DialogDescription>
        </DialogHeader>
        <div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!searching) void search.submit();
            }}
            className="flex items-start gap-2"
          >
            <Input
              ref={inputRef}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={search.url}
              onChange={(event) => {
                search.changeUrl(event.target.value);
              }}
              placeholder={t('placeholder')}
              aria-label={t('heading')}
              aria-invalid={linkInError}
              aria-describedby="new-search-status"
              className="h-9 flex-1"
            />
            {/* why: a disabled button drops focus to <body>, outside the modal. */}
            <Button
              type="submit"
              size="sm"
              loading={searching}
              focusableWhenDisabled
              className="h-9 shrink-0 aria-disabled:opacity-50"
            >
              {t('submit')}
              <ArrowRight className="size-3.5" />
            </Button>
          </form>
          <p
            id="new-search-status"
            aria-live="polite"
            className={cn(
              'mt-2 text-[13px] tracking-[-0.08px]',
              message?.tone === 'error'
                ? 'text-destructive'
                : 'text-slate-neutral',
            )}
          >
            {message === null ? null : t(message.key)}
          </p>
        </div>
        <DialogClose
          aria-label={t('newSearchClose')}
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2"
            />
          }
        >
          <XIcon />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
