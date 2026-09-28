'use client';

import { Globe } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { portalIconUrl } from '@/core/listing/portal-icon';
import type { PortalId } from '@/core/listing/types';

// why: decorative, since the host name is always written right after it.
export function ListingPortalIcon({ portal }: { portal: PortalId }) {
  const src = portalIconUrl(portal);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src === null || src === failedSrc) {
    return (
      <Globe
        aria-hidden
        strokeWidth={1.5}
        className="size-4 shrink-0 text-muted-foreground"
      />
    );
  }

  return (
    <Image
      unoptimized
      src={src}
      alt=""
      aria-hidden
      width={16}
      height={16}
      onError={() => setFailedSrc(src)}
      className="size-4 shrink-0 rounded-md"
    />
  );
}
