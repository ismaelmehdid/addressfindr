import type { UIMessage } from 'ai';
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({ SUPABASE_STORAGE_BUCKET: 'files' }),
}));

vi.mock('@/application/files/get-file-entity', () => ({
  getFileEntityForOrg: vi.fn(),
}));

vi.mock('@/application/files/create-signed-download-url', () => ({
  createSignedDownloadUrlForFile: vi.fn(),
}));

vi.mock('@/shared/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createSignedDownloadUrlForFile } from '@/application/files/create-signed-download-url';
import { getFileEntityForOrg } from '@/application/files/get-file-entity';
import { notFound } from '@/core/errors';
import { CHAT_PROVIDER_METADATA_KEY } from './dto';
import { expandChatAttachments } from './expand-attachments';

const STORAGE_KEY = 'org1/user1/attachments/file.pdf';
const ORIGINAL_NAME = 'file.pdf';
const FILE_ID = 'file-id-1';

function fileEntity() {
  return {
    id: FILE_ID,
    userId: 'user1',
    organizationId: 'org1',
    originalName: ORIGINAL_NAME,
    storageKey: STORAGE_KEY as never,
    mimeType: 'application/pdf' as never,
    fileType: 'pdf' as const,
    sizeBytes: 1024,
    status: 'uploaded' as const,
    indexStatus: 'indexed' as const,
    visionDescription: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function userMessage(parts: unknown[]): UIMessage {
  return {
    id: 'm1',
    role: 'user',
    parts: parts as UIMessage['parts'],
  } as UIMessage;
}

function filePart(overrides: Record<string, unknown> = {}) {
  return {
    type: 'file',
    mediaType: 'application/pdf',
    url: `https://supabase.example.com/storage/${STORAGE_KEY}?token=abc`,
    filename: ORIGINAL_NAME,
    providerMetadata: {
      [CHAT_PROVIDER_METADATA_KEY]: { fileId: FILE_ID },
    },
    ...overrides,
  };
}

describe('expandChatAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns messages unchanged when no file parts present', async () => {
    const messages: UIMessage[] = [
      userMessage([{ type: 'text', text: 'hello' }]),
    ];
    const result = await expandChatAttachments({
      messages,
      userId: 'user1',
      organizationId: 'org1',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe(messages);
    expect(getFileEntityForOrg).not.toHaveBeenCalled();
  });

  it('rejects when client url does not contain the storage key', async () => {
    vi.mocked(getFileEntityForOrg).mockResolvedValue(ok(fileEntity()));
    const messages = [
      userMessage([
        filePart({ url: 'https://supabase.example.com/other/path?token=abc' }),
      ]),
    ];
    const result = await expandChatAttachments({
      messages,
      userId: 'user1',
      organizationId: 'org1',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('forbidden');
  });

  it('rejects when client mediaType does not match stored mime', async () => {
    vi.mocked(getFileEntityForOrg).mockResolvedValue(ok(fileEntity()));
    const messages = [userMessage([filePart({ mediaType: 'image/png' })])];
    const result = await expandChatAttachments({
      messages,
      userId: 'user1',
      organizationId: 'org1',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('forbidden');
  });

  it('rejects when file lookup fails (not owned)', async () => {
    vi.mocked(getFileEntityForOrg).mockResolvedValue(
      err(notFound('File missing', 'file')),
    );
    const messages = [userMessage([filePart()])];
    const result = await expandChatAttachments({
      messages,
      userId: 'user1',
      organizationId: 'org1',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('forbidden');
  });

  it('rejects when batch size exceeds limit', async () => {
    vi.mocked(getFileEntityForOrg).mockResolvedValue(
      ok({ ...fileEntity(), sizeBytes: 11 * 1024 * 1024 }),
    );
    const messages = [userMessage([filePart()])];
    const result = await expandChatAttachments({
      messages,
      userId: 'user1',
      organizationId: 'org1',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('validation');
  });

  it('rewrites the part url with a fresh server-signed URL on success (image type)', async () => {
    const imageEntity = {
      ...fileEntity(),
      originalName: 'photo.png',
      mimeType: 'image/png' as never,
      fileType: 'png' as const,
    };
    const imagePart = {
      type: 'file',
      mediaType: 'image/png',
      url: `https://supabase.example.com/storage/${STORAGE_KEY}?token=abc`,
      filename: 'photo.png',
      providerMetadata: {
        [CHAT_PROVIDER_METADATA_KEY]: { fileId: FILE_ID },
      },
    };
    vi.mocked(getFileEntityForOrg).mockResolvedValue(ok(imageEntity));
    vi.mocked(createSignedDownloadUrlForFile).mockResolvedValue(
      ok({
        url:
          'https://supabase.example.com/storage/' +
          STORAGE_KEY +
          '?token=fresh',
        path: STORAGE_KEY as never,
        expiresAt: new Date(),
      }),
    );
    const messages = [userMessage([imagePart])];
    const result = await expandChatAttachments({
      messages,
      userId: 'user1',
      organizationId: 'org1',
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const updatedPart = result.value[0]?.parts[0] as {
      type: string;
      url: string;
    };
    expect(updatedPart.type).toBe('file');
    expect(updatedPart.url).toContain('token=fresh');
  });

  it('passes non-image attachments (PDF, DOCX) through unchanged after validation (stripping happens in the Mastra inputProcessor before LLM call)', async () => {
    vi.mocked(getFileEntityForOrg).mockResolvedValue(ok(fileEntity()));
    const messages = [userMessage([filePart()])];
    const result = await expandChatAttachments({
      messages,
      userId: 'user1',
      organizationId: 'org1',
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toBe(messages);
    const part = result.value[0]?.parts[0] as { type: string };
    expect(part.type).toBe('file');
    expect(vi.mocked(createSignedDownloadUrlForFile)).not.toHaveBeenCalled();
  });

  it('rejects malformed file parts (missing providerMetadata)', async () => {
    const malformed = {
      type: 'file',
      mediaType: 'application/pdf',
      url: `https://supabase.example.com/storage/${STORAGE_KEY}`,
    };
    const messages = [userMessage([malformed])];
    const result = await expandChatAttachments({
      messages,
      userId: 'user1',
      organizationId: 'org1',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('validation');
  });
});
