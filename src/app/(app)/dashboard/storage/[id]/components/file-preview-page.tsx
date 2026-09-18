'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AppPageHeader } from '../../../components/app-page-header';
import { DashboardPageHeaderBridge } from '../../../components/dashboard-page-header-bridge';
import { FilePreviewRenderer } from '../../components/file-preview-renderer';

type FileDto = {
  id: string;
  originalName: string;
  mimeType: string;
  fileType: string;
  sizeBytes: number;
  createdAt: string;
};

type SignedUrlEntry = { url: string; expiresAt: string };

export function FilePreviewPage({ file }: { file: FileDto }) {
  const tNav = useTranslations('Nav');
  const tStorage = useTranslations('Storage');
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch('/api/files/download-urls', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [file.id] }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        urls: Record<string, SignedUrlEntry>;
      };
      const fresh = json.urls[file.id]?.url ?? null;
      if (!cancelled) setSignedUrl(fresh);
    })();
    return () => {
      cancelled = true;
    };
  }, [file.id]);

  return (
    <>
      <DashboardPageHeaderBridge>
        <AppPageHeader
          title={file.originalName}
          breadcrumbs={[
            { label: tNav('dashboard'), href: '/dashboard' },
            { label: tNav('storage'), href: '/dashboard/storage' },
          ]}
          rightContent={
            <Button
              size="sm"
              variant="outline"
              disabled={!signedUrl}
              onClick={() => {
                if (signedUrl) window.open(signedUrl, '_blank');
              }}
            >
              <Download className="size-3.5" />
              {tStorage('download')}
            </Button>
          }
        />
      </DashboardPageHeaderBridge>
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-linen">
        {signedUrl ? (
          <FilePreviewRenderer
            fileType={file.fileType}
            fileName={file.originalName}
            signedUrl={signedUrl}
            unavailableLabel={tStorage('previewUnavailable')}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            {tStorage('previewLoading')}
          </div>
        )}
      </div>
    </>
  );
}
