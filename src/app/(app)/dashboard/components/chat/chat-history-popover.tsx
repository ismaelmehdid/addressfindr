'use client';

import { History, Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { cn } from '@/lib/utils';
import {
  deleteConversation,
  fetchConversations,
  renameConversation,
} from './chat-history-api';
import type { ConversationSummary } from './chat-history-types';

type Props = {
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onConversationDeleted?: (id: string) => void;
  disabled?: boolean;
};

type ListPhase = 'idle' | 'initial' | 'more';

export function ChatHistoryPopover({
  activeConversationId,
  onSelect,
  onConversationDeleted,
  disabled,
}: Props) {
  const t = useTranslations('Home');
  const tCommon = useTranslations('Common');
  const tErrors = useTranslations('Errors');

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [phase, setPhase] = useState<ListPhase>('idle');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const renameClosedRef = useRef(false);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const requestIdRef = useRef(0);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      requestIdRef.current++;
      setItems([]);
      setPage(0);
      setHasMore(false);
      setPhase('idle');
      setEditingId(null);
      setEditingValue('');
      return;
    }
    const requestId = ++requestIdRef.current;
    setPhase('initial');
    fetchConversations({ page: 0 }).then((res) => {
      if (requestIdRef.current !== requestId) return;
      setItems(res.items);
      setHasMore(res.hasMore);
      setPage(0);
      setPhase('idle');
    });
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || phase !== 'idle') return;
    const nextPage = page + 1;
    const requestId = ++requestIdRef.current;
    setPhase('more');
    fetchConversations({ page: nextPage }).then((res) => {
      if (requestIdRef.current !== requestId) return;
      setItems((prev) => [...prev, ...res.items]);
      setHasMore(res.hasMore);
      setPage(nextPage);
      setPhase('idle');
    });
  }, [page, hasMore, phase]);

  const { scrollContainerRef } = useInfiniteScroll({
    onEndReached: handleLoadMore,
    isFetchingMore: phase === 'more',
    threshold: 80,
  });

  const handleStartRename = (item: ConversationSummary): void => {
    renameClosedRef.current = false;
    setEditingId(item.id);
    setEditingValue(item.title ?? '');
  };

  const finishRename = useCallback((): void => {
    renameClosedRef.current = true;
    setEditingId(null);
    setEditingValue('');
  }, []);

  const handleSubmitRename = async (id: string): Promise<void> => {
    if (renameClosedRef.current) return;
    const trimmed = editingValue.trim();
    finishRename();
    if (!trimmed) return;

    const res = await renameConversation({
      threadId: id,
      title: trimmed,
    });
    if (!res.ok) {
      toast.error(tErrors('description'));
      return;
    }
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, title: res.data.title, updatedAt: res.data.updatedAt }
          : it,
      ),
    );
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!confirmingId) return;
    const id = confirmingId;
    setDeleting(true);
    const res = await deleteConversation(id);
    setDeleting(false);
    setConfirmingId(null);
    if (!res.ok) {
      toast.error(tErrors('description'));
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
    onConversationDeleted?.(id);
  };

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={t('history')}
              title={t('history')}
            >
              <History className="size-3.5" />
            </Button>
          }
        />
        <PopoverContent align="end" className="w-80 p-1">
          <div ref={scrollContainerRef} className="max-h-80 overflow-y-auto">
            <HistoryListBody
              phase={phase}
              items={items}
              activeConversationId={activeConversationId}
              editingId={editingId}
              editingValue={editingValue}
              labels={{
                loading: t('historyLoading'),
                empty: t('historyEmpty'),
                untitled: t('untitledConversation'),
                actions: t('conversationActions'),
                rename: t('rename'),
                delete: tCommon('delete'),
              }}
              onEditingValueChange={setEditingValue}
              onSubmitRename={handleSubmitRename}
              onCancelRename={finishRename}
              onSelect={onSelect}
              onStartRename={handleStartRename}
              onRequestDelete={(id) => {
                setOpen(false);
                setConfirmingId(id);
              }}
            />
          </div>
        </PopoverContent>
      </Popover>

      <Dialog
        open={confirmingId !== null}
        onOpenChange={(v) => {
          if (!v && !deleting) setConfirmingId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('deleteConfirmDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={deleting} />
              }
            >
              {tCommon('cancel')}
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
              disabled={deleting}
            >
              {tCommon('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type HistoryListBodyProps = {
  phase: ListPhase;
  items: ConversationSummary[];
  activeConversationId: string | null;
  editingId: string | null;
  editingValue: string;
  labels: {
    loading: string;
    empty: string;
    untitled: string;
    actions: string;
    rename: string;
    delete: string;
  };
  onEditingValueChange: (value: string) => void;
  onSubmitRename: (id: string) => void | Promise<void>;
  onCancelRename: () => void;
  onSelect: (id: string) => void;
  onStartRename: (item: ConversationSummary) => void;
  onRequestDelete: (id: string) => void;
};

function HistoryListBody({
  phase,
  items,
  activeConversationId,
  editingId,
  editingValue,
  labels,
  onEditingValueChange,
  onSubmitRename,
  onCancelRename,
  onSelect,
  onStartRename,
  onRequestDelete,
}: HistoryListBodyProps) {
  if (phase === 'initial') {
    return (
      <p className="px-2 py-3 text-xs text-muted-foreground">
        {labels.loading}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="px-2 py-3 text-xs text-muted-foreground">{labels.empty}</p>
    );
  }
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.id} className="group relative">
          {editingId === item.id ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void onSubmitRename(item.id);
              }}
              className="px-1 py-1"
            >
              <Input
                autoFocus
                value={editingValue}
                onChange={(e) => onEditingValueChange(e.target.value)}
                onBlur={() => void onSubmitRename(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancelRename();
                  }
                }}
                className="h-7 text-xs"
              />
            </form>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  'h-auto w-full justify-start truncate px-2 py-1.5 pr-8 text-left text-xs font-normal',
                  item.id === activeConversationId &&
                    'bg-muted text-foreground',
                )}
                onClick={() => onSelect(item.id)}
              >
                <span className="truncate">
                  {item.title ?? labels.untitled}
                </span>
              </Button>
              <div className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={labels.actions}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="size-3" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end" sideOffset={2}>
                    <DropdownMenuItem onClick={() => onStartRename(item)}>
                      <Pencil className="size-3.5" />
                      {labels.rename}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onRequestDelete(item.id)}
                    >
                      <Trash2 className="size-3.5" />
                      {labels.delete}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </li>
      ))}
      {phase === 'more' && (
        <li
          className="flex items-center justify-center py-2"
          aria-live="polite"
        >
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        </li>
      )}
    </ul>
  );
}
