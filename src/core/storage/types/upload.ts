import type { Bucket } from './bucket';
import type { FilePath, MimeType } from './file';

export type UploadBody = Blob | ArrayBuffer | Uint8Array;

export type UploadInput = {
  bucket: Bucket;
  path: FilePath;
  body: UploadBody;
  mimeType: MimeType;
  cacheControl?: string;
  upsert?: boolean;
};

export type UploadedFile = {
  bucket: Bucket;
  path: FilePath;
};
