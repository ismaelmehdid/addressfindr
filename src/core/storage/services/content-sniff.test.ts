import { describe, expect, it, vi } from 'vitest';

vi.mock('file-type', () => ({
  fileTypeFromBuffer: vi.fn(),
}));

import { fileTypeFromBuffer } from 'file-type';
import { assertMimeMatchesBytes } from './content-sniff';

const mockSniff = vi.mocked(fileTypeFromBuffer);

describe('assertMimeMatchesBytes', () => {
  it('accepts PDF when sniff returns application/pdf', async () => {
    mockSniff.mockResolvedValueOnce({ mime: 'application/pdf', ext: 'pdf' });
    const r = await assertMimeMatchesBytes({
      bytes: new Uint8Array([0]),
      expected: 'application/pdf' as never,
    });
    expect(r.isOk()).toBe(true);
  });

  it('accepts JPG variant when expected jpeg', async () => {
    mockSniff.mockResolvedValueOnce({ mime: 'image/jpg', ext: 'jpg' });
    const r = await assertMimeMatchesBytes({
      bytes: new Uint8Array([0]),
      expected: 'image/jpeg' as never,
    });
    expect(r.isOk()).toBe(true);
  });

  it('accepts zip-sniffed DOCX (Office container is sniffed as zip)', async () => {
    mockSniff.mockResolvedValueOnce({ mime: 'application/zip', ext: 'zip' });
    const r = await assertMimeMatchesBytes({
      bytes: new Uint8Array([0]),
      expected:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as never,
    });
    expect(r.isOk()).toBe(true);
  });

  it('rejects when sniffed MIME does not match expected', async () => {
    mockSniff.mockResolvedValueOnce({ mime: 'image/gif', ext: 'gif' });
    const r = await assertMimeMatchesBytes({
      bytes: new Uint8Array([0]),
      expected: 'image/png' as never,
    });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('validation');
  });

  it('passes when sniff fails AND expected MIME is text-like', async () => {
    mockSniff.mockResolvedValueOnce(undefined);
    for (const expected of ['text/plain', 'text/csv', 'application/json']) {
      mockSniff.mockResolvedValueOnce(undefined);
      const r = await assertMimeMatchesBytes({
        bytes: new Uint8Array([0]),
        expected: expected as never,
      });
      expect(r.isOk()).toBe(true);
    }
  });

  it('fails when sniff fails AND expected is not text-like', async () => {
    mockSniff.mockResolvedValueOnce(undefined);
    const r = await assertMimeMatchesBytes({
      bytes: new Uint8Array([0]),
      expected: 'application/pdf' as never,
    });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('validation');
  });
});
