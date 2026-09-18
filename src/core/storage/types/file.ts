import type { Bucket } from './bucket';

export type FilePath = string & { readonly __brand: 'FilePath' };

export type MimeType = string & { readonly __brand: 'MimeType' };

const MIME_TYPE_PATTERN = /^[a-z]+\/[a-z0-9.+-]+$/;

export function isMimeType(value: string): value is MimeType {
  return MIME_TYPE_PATTERN.test(value);
}

export function mimeType(value: string): MimeType {
  if (!isMimeType(value)) {
    throw new Error(`Invalid MIME type: ${value}`);
  }
  return value as MimeType;
}

export type FileCategory = 'attachments' | 'avatars' | 'exports' | 'documents';

export const FILE_CATEGORIES: readonly FileCategory[] = [
  'attachments',
  'avatars',
  'exports',
  'documents',
] as const;

export type FileObject = {
  path: FilePath;
  bucket: Bucket;
  sizeBytes: number;
  mimeType: MimeType;
  createdAt: Date;
  updatedAt: Date;
};
