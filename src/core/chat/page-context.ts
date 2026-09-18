import * as v from 'valibot';

export const PageContextKind = {
  NONE: 'none',
  STORAGE_FILE: 'storage-file',
} as const;

export type PageContextKind =
  (typeof PageContextKind)[keyof typeof PageContextKind];

export const PageContextSchema = v.union([
  v.object({ kind: v.literal(PageContextKind.NONE) }),
  v.object({
    kind: v.literal(PageContextKind.STORAGE_FILE),
    id: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  }),
]);

export type PageContext = v.InferOutput<typeof PageContextSchema>;

const STORAGE_FILE_RE = /^\/dashboard\/storage\/([^/?#]+)/;

export function parsePathnameToPageContext(pathname: string): PageContext {
  const storageMatch = STORAGE_FILE_RE.exec(pathname);
  if (storageMatch?.[1]) {
    return { kind: PageContextKind.STORAGE_FILE, id: storageMatch[1] };
  }
  return { kind: PageContextKind.NONE };
}
