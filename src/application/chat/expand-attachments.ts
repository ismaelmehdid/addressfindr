import 'server-only';

import type { UIMessage } from 'ai';
import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import { createSignedDownloadUrlForFile } from '@/application/files/create-signed-download-url';
import { getFileEntityForOrg } from '@/application/files/get-file-entity';
import { validateAttachmentBatch } from '@/core/chat/attachment-rules';
import { type AppError, forbidden, validation } from '@/core/errors';
import { log } from '@/shared/logger';
import { CHAT_PROVIDER_METADATA_KEY, ChatFileUIPartSchema } from './dto';

const SIGNED_URL_TTL_SECONDS = 600;

const OPENAI_FILE_PART_MEDIA_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export type ExpandAttachmentsInput = {
  messages: UIMessage[];
  userId: string;
  organizationId: string;
};

export async function expandChatAttachments(
  input: ExpandAttachmentsInput,
): Promise<Result<UIMessage[], AppError>> {
  const lastUserIndex = findLastUserMessageIndex(input.messages);
  if (lastUserIndex === -1) return ok(input.messages);

  const message = input.messages[lastUserIndex];
  if (!message) return ok(input.messages);

  const parts = Array.isArray(message.parts) ? message.parts : [];
  const fileParts: Array<{ index: number; part: unknown }> = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (
      part !== null &&
      typeof part === 'object' &&
      'type' in part &&
      (part as { type?: unknown }).type === 'file'
    ) {
      fileParts.push({ index: i, part });
    }
  }
  if (fileParts.length === 0) return ok(input.messages);

  const validatedParts = fileParts.map(({ index, part }) => {
    const parsed = v.safeParse(ChatFileUIPartSchema, part);
    if (!parsed.success) {
      return {
        ok: false as const,
        index,
        message: parsed.issues[0]?.message ?? 'Invalid file attachment shape',
      };
    }
    return { ok: true as const, index, value: parsed.output };
  });

  for (const result of validatedParts) {
    if (!result.ok) {
      return err(validation(result.message, 'attachments'));
    }
  }

  const lookups = await Promise.all(
    validatedParts.map(async (result) => {
      if (!result.ok) return null;
      const fileId =
        result.value.providerMetadata[CHAT_PROVIDER_METADATA_KEY].fileId;
      const file = await getFileEntityForOrg({
        fileId,
        organizationId: input.organizationId,
      });
      return { index: result.index, clientPart: result.value, file };
    }),
  );

  for (const lookup of lookups) {
    if (!lookup) continue;
    if (lookup.file.isErr()) {
      log.warn('chat.attachment.lookup_failed', {
        userId: input.userId,
        organizationId: input.organizationId,
        code: lookup.file.error.code,
      });
      return err(forbidden('Attachment not accessible'));
    }
    if (!lookup.clientPart.url.includes(lookup.file.value.storageKey)) {
      log.warn('chat.attachment.url_mismatch', {
        userId: input.userId,
        fileId: lookup.file.value.id,
      });
      return err(forbidden('Attachment URL does not match file'));
    }
    if (lookup.clientPart.mediaType !== lookup.file.value.mimeType) {
      log.warn('chat.attachment.mime_mismatch', {
        userId: input.userId,
        fileId: lookup.file.value.id,
      });
      return err(forbidden('Attachment mime type does not match file'));
    }
  }

  const sizes = lookups
    .map((l) => (l?.file.isOk() ? { sizeBytes: l.file.value.sizeBytes } : null))
    .filter((s): s is { sizeBytes: number } => s !== null);
  const batchOk = validateAttachmentBatch(sizes);
  if (batchOk.isErr()) return err(batchOk.error);

  const refreshedParts: Record<number, unknown> = {};
  for (const lookup of lookups) {
    if (!lookup || lookup.file.isErr()) continue;
    const file = lookup.file.value;

    if (!OPENAI_FILE_PART_MEDIA_TYPES.has(file.mimeType)) {
      continue;
    }

    const signed = await createSignedDownloadUrlForFile({
      storageKey: file.storageKey,
      ttlSeconds: SIGNED_URL_TTL_SECONDS,
      downloadAs: file.originalName,
    });
    if (signed.isErr()) {
      log.warn('chat.attachment.sign_failed', {
        fileId: file.id,
        code: signed.error.code,
      });
      return err(signed.error);
    }
    refreshedParts[lookup.index] = {
      type: 'file',
      mediaType: file.mimeType,
      url: signed.value.url,
      filename: file.originalName,
      providerMetadata: {
        [CHAT_PROVIDER_METADATA_KEY]: {
          fileId: file.id,
        },
      },
    };
  }

  const hasRefreshedAny = Object.keys(refreshedParts).length > 0;
  if (!hasRefreshedAny) return ok(input.messages);

  const nextParts = parts.map((part, i) =>
    i in refreshedParts ? refreshedParts[i] : part,
  );
  const nextMessage = { ...message, parts: nextParts } as UIMessage;
  const nextMessages = input.messages.slice();
  nextMessages[lastUserIndex] = nextMessage;

  log.info('chat.attachments.expanded', {
    userId: input.userId,
    organizationId: input.organizationId,
    count: fileParts.length,
  });

  return ok(nextMessages);
}

function findLastUserMessageIndex(messages: UIMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return i;
  }
  return -1;
}
