import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { Bucket } from '../types/bucket';
import type { FileObject, FilePath } from '../types/file';
import type { ImageTransform } from '../types/image-transform';
import type { SignedUploadCredentials, SignedUrl } from '../types/signed-url';
import type { UploadedFile, UploadInput } from '../types/upload';

export type CreateSignedUploadCredentialsInput = {
  bucket: Bucket;
  path: FilePath;
  upsert?: boolean;
};

export type CreateSignedDownloadUrlInput = {
  bucket: Bucket;
  path: FilePath;
  ttlSeconds: number;
  transform?: ImageTransform;
  downloadAs?: string;
};

export type GetPublicUrlInput = {
  bucket: Bucket;
  path: FilePath;
  transform?: ImageTransform;
};

export type DownloadInput = {
  bucket: Bucket;
  path: FilePath;
  transform?: ImageTransform;
};

export type RemoveInput = {
  bucket: Bucket;
  paths: FilePath[];
};

export type ListInput = {
  bucket: Bucket;
  prefix: string;
  limit: number;
  offset: number;
};

export type StatInput = {
  bucket: Bucket;
  path: FilePath;
};

export type StoragePort = {
  upload(input: UploadInput): Promise<Result<UploadedFile, AppError>>;
  createSignedUploadCredentials(
    input: CreateSignedUploadCredentialsInput,
  ): Promise<Result<SignedUploadCredentials, AppError>>;
  createSignedDownloadUrl(
    input: CreateSignedDownloadUrlInput,
  ): Promise<Result<SignedUrl, AppError>>;
  getPublicUrl(input: GetPublicUrlInput): Result<string, AppError>;
  download(input: DownloadInput): Promise<Result<Blob, AppError>>;
  remove(input: RemoveInput): Promise<Result<void, AppError>>;
  list(input: ListInput): Promise<Result<FileObject[], AppError>>;
  stat(input: StatInput): Promise<Result<FileObject, AppError>>;
};
