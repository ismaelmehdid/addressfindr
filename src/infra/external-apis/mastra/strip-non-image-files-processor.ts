import 'server-only';

import type { MastraDBMessage } from '@mastra/core/agent';
import type { InputProcessor } from '@mastra/core/processors';
import { CHAT_PROVIDER_METADATA_KEY } from '@/application/chat/dto';
import { createSignedDownloadUrlForFile } from '@/application/files/create-signed-download-url';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

const SIGNED_URL_TTL_SECONDS = 600;

const OPENAI_FILE_PART_MEDIA_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

function readMediaType(part: Record<string, unknown>): string | null {
  const m = part.mediaType ?? part.mimeType ?? part.contentType;
  return typeof m === 'string' && m.length > 0 ? m : null;
}

function readPartUrl(part: Record<string, unknown>): string | null {
  const v = part.url ?? part.data;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function readFileId(part: Record<string, unknown>): string | null {
  const meta = part.providerMetadata;
  if (!meta || typeof meta !== 'object') return null;
  const ns = (meta as Record<string, unknown>)[CHAT_PROVIDER_METADATA_KEY];
  if (!ns || typeof ns !== 'object') return null;
  const fileId = (ns as Record<string, unknown>).fileId;
  return typeof fileId === 'string' && fileId.length > 0 ? fileId : null;
}

function readFilename(part: Record<string, unknown>): string {
  const f = part.filename ?? part.name;
  return typeof f === 'string' && f.length > 0 ? f : 'attachment';
}

function buildHintText(args: {
  filename: string;
  mediaType: string;
  fileId: string;
}): string {
  return `[Attached file: "${args.filename}" (mime: ${args.mediaType}, fileId: ${args.fileId}). The file is already indexed; call searchFileText({ fileId: "${args.fileId}", query: "..." }) to read its content or quote from it.]`;
}

function extractStorageKey(url: string, bucket: string): string | null {
  try {
    const u = new URL(url);
    const marker = `/storage/v1/object/sign/${bucket}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    return u.pathname.slice(idx + marker.length);
  } catch {
    return null;
  }
}

async function reSignUrl(args: {
  bucket: string;
  storageKey: string;
}): Promise<string | null> {
  const signed = await createSignedDownloadUrlForFile({
    storageKey: args.storageKey as never,
    ttlSeconds: SIGNED_URL_TTL_SECONDS,
  });
  if (signed.isErr()) {
    log.warn('strip-processor.sign_failed', {
      storageKey: args.storageKey,
      code: signed.error.code,
    });
    return null;
  }
  return signed.value.url;
}

type ContentLike = {
  parts?: unknown[];
  experimental_attachments?: unknown[];
} & Record<string, unknown>;

export const stripNonImageFilePartsProcessor: InputProcessor = {
  id: 'strip-non-image-file-parts',
  name: 'Strip non-image file parts',
  description:
    'For each user message: replaces non-image file parts (PDF, DOCX, etc.) with a text hint pointing to searchFileText (so OpenAI Chat Completions does not reject the request), and refreshes signed URLs for image file parts in both parts[] and experimental_attachments[] (so OpenAI vision can fetch them without 400). Memory keeps original parts.',
  processInput: async ({ messages }) => {
    const bucket = env().SUPABASE_STORAGE_BUCKET;

    const imageUrls = new Set<string>();
    for (const m of messages) {
      if (m.role !== 'user') continue;
      const content = m.content as unknown as ContentLike | undefined;
      if (!content) continue;
      const parts = Array.isArray(content.parts) ? content.parts : [];
      for (const part of parts) {
        if (
          part === null ||
          typeof part !== 'object' ||
          (part as { type?: unknown }).type !== 'file'
        ) {
          continue;
        }
        const obj = part as Record<string, unknown>;
        const mediaType = readMediaType(obj);
        const url = readPartUrl(obj);
        if (!mediaType || !url) continue;
        if (OPENAI_FILE_PART_MEDIA_TYPES.has(mediaType)) imageUrls.add(url);
      }
      const atts = Array.isArray(content.experimental_attachments)
        ? content.experimental_attachments
        : [];
      for (const att of atts) {
        if (att === null || typeof att !== 'object') continue;
        const obj = att as Record<string, unknown>;
        const mediaType = readMediaType(obj);
        const url =
          typeof obj.url === 'string' && obj.url.length > 0 ? obj.url : null;
        if (!mediaType || !url) continue;
        if (OPENAI_FILE_PART_MEDIA_TYPES.has(mediaType)) imageUrls.add(url);
      }
    }

    const freshByOldUrl = new Map<string, string>();
    await Promise.all(
      Array.from(imageUrls).map(async (oldUrl) => {
        const storageKey = extractStorageKey(oldUrl, bucket);
        if (!storageKey) return;
        const fresh = await reSignUrl({ bucket, storageKey });
        if (fresh) freshByOldUrl.set(oldUrl, fresh);
      }),
    );

    const next: MastraDBMessage[] = messages.map((m) => {
      if (m.role !== 'user') return m;
      const content = m.content as unknown as ContentLike | undefined;
      if (!content) return m;

      let changedParts = false;
      const parts = Array.isArray(content.parts) ? content.parts : [];
      const nextParts = parts.map((part) => {
        if (
          part === null ||
          typeof part !== 'object' ||
          (part as { type?: unknown }).type !== 'file'
        ) {
          return part;
        }
        const obj = part as Record<string, unknown>;
        const mediaType = readMediaType(obj);
        const fileId = readFileId(obj);
        if (!mediaType) return part;

        if (OPENAI_FILE_PART_MEDIA_TYPES.has(mediaType)) {
          const url = readPartUrl(obj);
          if (!url) return part;
          const fresh = freshByOldUrl.get(url);
          if (!fresh) return part;
          changedParts = true;
          const out: Record<string, unknown> = { ...obj };
          if (typeof obj.url === 'string') out.url = fresh;
          if (typeof obj.data === 'string') out.data = fresh;
          return out;
        }

        if (!fileId) return part;
        changedParts = true;
        return {
          type: 'text',
          text: buildHintText({
            filename: readFilename(obj),
            mediaType,
            fileId,
          }),
        };
      });

      let changedAtts = false;
      const atts = Array.isArray(content.experimental_attachments)
        ? content.experimental_attachments
        : [];
      const nextAtts: unknown[] = [];
      for (const att of atts) {
        if (att === null || typeof att !== 'object') {
          nextAtts.push(att);
          continue;
        }
        const obj = att as Record<string, unknown>;
        const mediaType = readMediaType(obj);
        const url =
          typeof obj.url === 'string' && obj.url.length > 0 ? obj.url : null;
        if (!mediaType || !url) {
          nextAtts.push(att);
          continue;
        }
        if (OPENAI_FILE_PART_MEDIA_TYPES.has(mediaType)) {
          const fresh = freshByOldUrl.get(url);
          if (!fresh) {
            nextAtts.push(att);
            continue;
          }
          changedAtts = true;
          nextAtts.push({ ...obj, url: fresh });
          continue;
        }
        changedAtts = true;
      }

      if (!changedParts && !changedAtts) return m;
      return {
        ...m,
        content: {
          ...content,
          ...(changedParts ? { parts: nextParts as typeof parts } : {}),
          ...(changedAtts ? { experimental_attachments: nextAtts } : {}),
        },
      } as MastraDBMessage;
    });

    return next;
  },
};
