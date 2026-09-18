'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type AttachmentDraft = {
  localId: string;
  file: File;
};

type Props = {
  attachments: AttachmentDraft[];
  onRemove: (localId: string) => void;
  disabled?: boolean;
};

function AttachmentCard({
  attachment,
  onRemove,
  disabled,
}: {
  attachment: AttachmentDraft;
  onRemove: (localId: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('Home');
  const isImage = attachment.file.type.startsWith('image/');
  const previewUrl = useMemo<string | null>(
    () => (isImage ? URL.createObjectURL(attachment.file) : null),
    [attachment.file, isImage],
  );
  useEffect(() => {
    if (!previewUrl) return;
    return (): void => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);
  const ext = attachment.file.name.split('.').pop()?.toUpperCase() ?? '';

  return (
    <div
      className={cn(
        'group relative flex h-16 w-44 shrink-0 items-center gap-2 rounded-lg border bg-card p-2 shadow-sm',
      )}
    >
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded bg-linen">
        {isImage && previewUrl ? (
          // biome-ignore lint/performance/noImgElement: object URL not supported by next/image
          <img
            src={previewUrl}
            alt={attachment.file.name}
            className="size-full object-cover"
          />
        ) : (
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">
            {ext}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[11px] font-medium text-ink">
          {attachment.file.name}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {formatBytes(attachment.file.size)}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-5 shrink-0"
        onClick={() => onRemove(attachment.localId)}
        disabled={disabled}
        aria-label={t('attachRemove')}
        title={t('attachRemove')}
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentTrayImpl({ attachments, onRemove, disabled }: Props) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 pb-1">
      {attachments.map((a) => (
        <AttachmentCard
          key={a.localId}
          attachment={a}
          onRemove={onRemove}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

export const AttachmentTray = memo(AttachmentTrayImpl);
