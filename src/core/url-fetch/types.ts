export type FetchedUrlContent = {
  url: string;
  finalUrl: string;
  mediaType: string;
  text: string;
  sizeBytes: number;
  truncated: boolean;
};

export type FetchUrlInput = {
  url: string;
};

export const URL_FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const URL_FETCH_TIMEOUT_MS = 10_000;

export const URL_FETCH_ALLOWED_MEDIA_TYPES = [
  'text/html',
  'text/plain',
  'text/markdown',
  'application/json',
  'application/xml',
  'application/xhtml+xml',
] as const;

export type UrlFetchAllowedMediaType =
  (typeof URL_FETCH_ALLOWED_MEDIA_TYPES)[number];
