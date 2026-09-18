'use client';

import { useTranslations } from 'next-intl';
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  deleting: boolean;
  fileName: string | null;
};

export function DeleteFileDialog({
  open,
  onOpenChange,
  onConfirm,
  deleting,
  fileName,
}: Props) {
  const t = useTranslations('Storage');
  const tCommon = useTranslations('Common');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('deleteConfirmTitle')}</DialogTitle>
          <DialogDescription>
            {fileName
              ? t('deleteConfirmDescription', { name: fileName })
              : t('deleteConfirmDescriptionGeneric')}
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
            onClick={onConfirm}
            loading={deleting}
          >
            {tCommon('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
