'use client';

import {
  Download,
  Maximize2,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Props = {
  onOpen: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
  disabled?: boolean;
};

export function FileTileActions({
  onOpen,
  onDownload,
  onRename,
  onDelete,
  disabled,
}: Props) {
  const t = useTranslations('Storage');
  const tCommon = useTranslations('Common');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={t('rowActions')}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg border border-stone bg-paper shadow-sm hover:bg-linen"
          >
            <MoreVertical className="size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onClick={onOpen}>
          <Maximize2 className="size-3.5" />
          {t('open')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDownload}>
          <Download className="size-3.5" />
          {t('download')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onRename}>
          <Pencil className="size-3.5" />
          {t('rename')}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="size-3.5" />
          {tCommon('delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
