import type { Bucket } from './bucket';
import type { FilePath } from './file';

export const SIGNED_UPLOAD_URL_TTL_SECONDS = 7200;
export const RESUMABLE_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;

export type SignedUrl = {
  url: string;
  path: FilePath;
  expiresAt: Date;
};

export type SignedUploadCredentials = {
  bucket: Bucket;
  path: FilePath;
  token: string;
  signedUrl: string;
  resumableEndpoint: string;
  resumableChunkSizeBytes: number;
  expiresAt: Date;
};
