'use client';

import { Building2 } from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

export type OrgSquareAvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const sizeClasses: Record<OrgSquareAvatarSize, string> = {
  xs: 'size-5',
  sm: 'size-6',
  md: 'size-7',
  lg: 'size-8',
};

const initialsTextSize: Record<OrgSquareAvatarSize, string> = {
  xs: 'text-[8px]',
  sm: 'text-[9px]',
  md: 'text-[10px]',
  lg: 'text-xs',
};

const iconSize: Record<OrgSquareAvatarSize, string> = {
  xs: 'size-3',
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-4',
};

type Props = {
  src?: string | null;
  alt: string;
  fallback?: string;
  size?: OrgSquareAvatarSize;
  className?: string;
};

export function OrgSquareAvatar({
  src,
  alt,
  fallback,
  size = 'md',
  className,
}: Props) {
  const [failed, setFailed] = useState(false);
  const showFallback = failed || !src;

  const initials = useMemo(() => {
    const cleaned = fallback?.trim();
    if (!cleaned) return '';
    return cleaned.slice(0, 2).toUpperCase();
  }, [fallback]);

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-primary font-medium text-primary-foreground',
        sizeClasses[size],
        className,
      )}
    >
      {showFallback ? (
        initials ? (
          <span className={initialsTextSize[size]}>{initials}</span>
        ) : (
          <Building2 className={iconSize[size]} />
        )
      ) : (
        <Image
          src={src as string}
          alt={alt}
          fill
          sizes="32px"
          unoptimized
          className="object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
