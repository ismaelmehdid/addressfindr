'use client';

import { Upload } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';

type Props = {
  onDropFiles: (files: File[]) => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  overlayLabel?: string;
};

export function FilesDropZone({
  onDropFiles,
  disabled,
  children,
  className,
  overlayLabel,
}: Props) {
  const t = useTranslations('Storage');
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);

  const containerRef = useRef<HTMLDivElement>(null);

  const onEnter = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      if (dragDepthRef.current === 1) setIsDragging(true);
    },
    [disabled],
  );

  const onLeave = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDragging(false);
    },
    [disabled],
  );

  const onOver = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [disabled],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onDropFiles(files);
    },
    [disabled, onDropFiles],
  );

  useEffect(() => {
    const reset = (): void => {
      dragDepthRef.current = 0;
      setIsDragging(false);
    };
    window.addEventListener('dragend', reset);
    window.addEventListener('mouseleave', reset);
    return () => {
      window.removeEventListener('dragend', reset);
      window.removeEventListener('mouseleave', reset);
    };
  }, []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: passive drop surface, files are alternatively uploaded via the keyboard-accessible Upload button
    <div
      ref={containerRef}
      onDragEnter={onEnter}
      onDragLeave={onLeave}
      onDragOver={onOver}
      onDrop={onDrop}
      className={cn('relative', className)}
    >
      {children}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            key="drop-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-paper/90 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2, delay: 0.05, ease: 'easeOut' }}
              className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-charcoal px-8 py-6"
            >
              <Upload className="size-8 text-charcoal" />
              <p className="text-sm font-medium text-ink">
                {overlayLabel ?? t('dropToUpload')}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
