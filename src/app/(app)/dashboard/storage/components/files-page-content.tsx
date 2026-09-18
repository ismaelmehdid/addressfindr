'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import posthog from 'posthog-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppPageHeader } from '../../components/app-page-header';
import { DashboardPageHeaderBridge } from '../../components/dashboard-page-header-bridge';
import { DeleteFileDialog } from './delete-file-dialog';
import { FileUploader } from './file-uploader';
import { FilesDropZone } from './files-drop-zone';
import { FilesGrid } from './files-grid';
import { RenameFileDialog } from './rename-file-dialog';

type FileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  fileType: string;
  sizeBytes: number;
  status: string;
  indexStatus: string;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  initialItems: FileRow[];
  initialHasMore: boolean;
  initialPage: number;
};

type FilesPageDto = {
  items: FileRow[];
  hasMore: boolean;
  page: number;
};

type SignedUrlEntry = { url: string; expiresAt: string };

type ListPhase = 'idle' | 'more' | 'refetching';

export function FilesPageContent({
  initialItems,
  initialHasMore,
  initialPage,
}: Props) {
  const tNav = useTranslations('Nav');
  const tStorage = useTranslations('Storage');
  const tErrors = useTranslations('Errors');
  const router = useRouter();

  const [items, setItems] = useState<FileRow[]>(initialItems);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [phase, setPhase] = useState<ListPhase>('idle');
  const requestIdRef = useRef(0);

  const [signedUrls, setSignedUrls] = useState<Record<string, SignedUrlEntry>>(
    {},
  );
  const inFlightUrls = useRef<Set<string>>(new Set());
  const permanentlyMissingUrls = useRef<Set<string>>(new Set());

  const [renameFile, setRenameFile] = useState<FileRow | null>(null);
  const [renamePending, setRenamePending] = useState(false);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<FileRow | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const ensureUrlsFor = useCallback(
    async (rows: FileRow[]) => {
      const now = Date.now();
      const needed = rows
        .map((r) => r.id)
        .filter((id) => {
          if (permanentlyMissingUrls.current.has(id)) return false;
          if (inFlightUrls.current.has(id)) return false;
          const existing = signedUrls[id];
          if (!existing) return true;
          const expiresMs = new Date(existing.expiresAt).getTime();
          return expiresMs - now < 60_000;
        });
      if (needed.length === 0) return;
      for (const id of needed) inFlightUrls.current.add(id);
      try {
        const res = await fetch('/api/files/download-urls', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids: needed }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          urls: Record<string, SignedUrlEntry>;
          missingIds?: string[];
        };
        for (const missing of json.missingIds ?? []) {
          permanentlyMissingUrls.current.add(missing);
        }
        if (Object.keys(json.urls).length > 0) {
          setSignedUrls((prev) => ({ ...prev, ...json.urls }));
        }
      } finally {
        for (const id of needed) inFlightUrls.current.delete(id);
      }
    },
    [signedUrls],
  );

  useEffect(() => {
    if (items.length === 0) return;
    void ensureUrlsFor(items);
  }, [items, ensureUrlsFor]);

  const handleLoadMore = useCallback(() => {
    if (phase !== 'idle' || !hasMore) return;
    const nextPage = page + 1;
    const reqId = ++requestIdRef.current;
    setPhase('more');
    fetch(`/api/files?page=${nextPage}`)
      .then((r) => (r.ok ? (r.json() as Promise<FilesPageDto>) : null))
      .then((data) => {
        if (requestIdRef.current !== reqId) return;
        if (!data) {
          setPhase('idle');
          return;
        }
        setItems((prev) => [...prev, ...data.items]);
        setHasMore(data.hasMore);
        setPage(data.page);
        setPhase('idle');
      })
      .catch(() => {
        if (requestIdRef.current === reqId) setPhase('idle');
      });
  }, [page, hasMore, phase]);

  const refetchFirstPage = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    setPhase('refetching');
    try {
      const res = await fetch('/api/files?page=0');
      if (!res.ok) {
        toast.error(tErrors('description'));
        return;
      }
      const data = (await res.json()) as FilesPageDto;
      if (requestIdRef.current !== reqId) return;
      setItems(data.items);
      setHasMore(data.hasMore);
      setPage(0);
    } finally {
      if (requestIdRef.current === reqId) setPhase('idle');
    }
  }, [tErrors]);

  const handleDownload = async (file: FileRow): Promise<void> => {
    posthog.capture('file_downloaded', {
      file_id: file.id,
      file_type: file.fileType,
    });
    const cached = signedUrls[file.id];
    if (cached) {
      window.open(cached.url, '_blank');
      return;
    }
    const toastId = toast.loading(tStorage('preparingDownload'));
    const res = await fetch(`/api/files/${file.id}`);
    if (!res.ok) {
      toast.error(tErrors('description'), { id: toastId });
      return;
    }
    const json = (await res.json()) as { url: string };
    toast.dismiss(toastId);
    window.open(json.url, '_blank');
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!confirmDeleteFile) return;
    const id = confirmDeleteFile.id;
    setDeleting(true);
    try {
      const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error(tErrors('description'));
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
      setSignedUrls((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } finally {
      setDeleting(false);
      setConfirmDeleteFile(null);
    }
  };

  const handleConfirmRename = async (newName: string): Promise<void> => {
    if (!renameFile) return;
    const id = renameFile.id;
    setRenamePending(true);
    try {
      const res = await fetch(`/api/files/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ originalName: newName }),
      });
      if (!res.ok) {
        toast.error(tErrors('description'));
        return;
      }
      const updated = (await res.json()) as FileRow;
      setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
    } finally {
      setRenamePending(false);
      setRenameFile(null);
    }
  };

  const handleUploadFiles = useCallback(
    async (_files: File[]) => {
      await refetchFirstPage();
    },
    [refetchFirstPage],
  );

  const urlsMap: Record<string, string> = {};
  for (const [id, entry] of Object.entries(signedUrls)) urlsMap[id] = entry.url;

  return (
    <>
      <DashboardPageHeaderBridge>
        <AppPageHeader
          title={tNav('storage')}
          breadcrumbs={[{ label: tNav('dashboard'), href: '/dashboard' }]}
          helpTooltip={tStorage('pageHelp')}
          rightContent={<FileUploader onUploaded={refetchFirstPage} />}
        />
      </DashboardPageHeaderBridge>
      <FilesDropZone
        onDropFiles={handleUploadFiles}
        className="flex flex-1 min-h-0 flex-col overflow-hidden"
      >
        <FilesGrid
          items={items}
          signedUrls={urlsMap}
          hasMore={hasMore}
          fetchingMore={phase === 'more'}
          onEndReached={handleLoadMore}
          onOpen={(file) => router.push(`/dashboard/storage/${file.id}`)}
          onDownload={(file) => void handleDownload(file)}
          onRename={(file) => setRenameFile(file)}
          onDelete={(file) => setConfirmDeleteFile(file)}
        />
      </FilesDropZone>

      <RenameFileDialog
        open={renameFile !== null}
        currentName={renameFile?.originalName ?? ''}
        onOpenChange={(open) => {
          if (!open && !renamePending) setRenameFile(null);
        }}
        onConfirm={handleConfirmRename}
        pending={renamePending}
      />

      <DeleteFileDialog
        open={confirmDeleteFile !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setConfirmDeleteFile(null);
        }}
        onConfirm={() => void handleConfirmDelete()}
        deleting={deleting}
        fileName={confirmDeleteFile?.originalName ?? null}
      />
    </>
  );
}
