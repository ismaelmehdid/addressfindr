'use client';

import { memo } from 'react';

type Props = {
  signedUrl: string;
  alt: string;
};

function ImageInlinePreviewImpl({ signedUrl, alt }: Props) {
  return (
    // biome-ignore lint/performance/noImgElement: signed Supabase URLs are short-lived and not suited for next/image's static optimizer
    <img
      src={signedUrl}
      alt={alt}
      loading="lazy"
      className="h-full w-full object-contain"
    />
  );
}

export const ImageInlinePreview = memo(ImageInlinePreviewImpl);
