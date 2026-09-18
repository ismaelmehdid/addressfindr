'use client';

import { Loader2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ALLOWED_MIME_TYPES,
  type AllowedMimeType,
} from '@/application/storage/dto';
import { Button } from '@/components/ui/button';
import { MAX_FILE_SIZE_BYTES } from '@/core/file/mime-mapping';
import { validateMagicBytes } from './validate-magic-bytes';

type Props = {
  onUploaded: () => void;
};

const ACCEPT = ALLOWED_MIME_TYPES.join(',');

async function uploadOne(file: File): Promise<void> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('size');
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type as AllowedMimeType)) {
    throw new Error('type');
  }
  const matches = await validateMagicBytes(file, file.type);
  if (!matches) {
    throw new Error('mimeMismatch');
  }
  const initRes = await fetch('/api/files/upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    }),
  });
  if (!initRes.ok) {
    const text = await initRes.text().catch(() => '');
    console.error('[upload] initiate failed', initRes.status, text);
    throw new Error('initiate');
  }
  const init = (await initRes.json()) as {
    fileId: string;
    signedUrl: string;
    token: string;
  };

  const uploadRes = await fetch(init.signedUrl, {
    method: 'PUT',
    headers: {
      'content-type': file.type,
      authorization: `Bearer ${init.token}`,
      'x-upsert': 'false',
    },
    body: file,
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => '');
    console.error(
      '[upload] PUT to Supabase failed',
      uploadRes.status,
      uploadRes.statusText,
      text,
    );
    await fetch(`/api/files/${init.fileId}`, { method: 'DELETE' }).catch(
      () => undefined,
    );
    throw new Error('upload');
  }

  const finalizeRes = await fetch('/api/files/finalize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileId: init.fileId }),
  });
  if (!finalizeRes.ok) {
    const text = await finalizeRes.text().catch(() => '');
    console.error('[upload] finalize failed', finalizeRes.status, text);
    throw new Error('finalize');
  }
}

export function FileUploader({ onUploaded }: Props) {
  const t = useTranslations('Storage');
  const tErrors = useTranslations('Errors');
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        try {
          await uploadOne(file);
        } catch (e) {
          const reason = e instanceof Error ? e.message : 'unknown';
          if (reason === 'size') toast.error(t('errorFileTooLarge'));
          else if (reason === 'type') toast.error(t('errorMimeNotSupported'));
          else if (reason === 'mimeMismatch')
            toast.error(t('errorMimeMismatch'));
          else toast.error(tErrors('description'));
        }
      }
      onUploaded();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="default"
        size="sm"
        data-help-id="storage.upload"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Upload className="size-3.5" />
        )}
        {t('uploadButton')}
      </Button>
    </>
  );
}
