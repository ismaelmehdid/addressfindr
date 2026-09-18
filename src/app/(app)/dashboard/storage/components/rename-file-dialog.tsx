'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type Props = {
  open: boolean;
  currentName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (newName: string) => void | Promise<void>;
  pending: boolean;
};

export function RenameFileDialog({
  open,
  currentName,
  onOpenChange,
  onConfirm,
  pending,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <RenameFormContent
          key={`${open ? 'open' : 'closed'}:${currentName}`}
          currentName={currentName}
          onConfirm={onConfirm}
          pending={pending}
        />
      </DialogContent>
    </Dialog>
  );
}

function RenameFormContent({
  currentName,
  onConfirm,
  pending,
}: {
  currentName: string;
  onConfirm: (newName: string) => void | Promise<void>;
  pending: boolean;
}) {
  const t = useTranslations('Storage');
  const tCommon = useTranslations('Common');
  const [value, setValue] = useState(currentName);

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    void onConfirm(trimmed);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('renameDialogTitle')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('renamePlaceholder')}
          maxLength={255}
          disabled={pending}
        />
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline" disabled={pending} />
            }
          >
            {tCommon('cancel')}
          </DialogClose>
          <Button
            type="submit"
            variant="default"
            loading={pending}
            disabled={value.trim().length === 0}
          >
            {tCommon('save')}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
