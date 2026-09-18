import { describe, expect, it } from 'vitest';
import {
  buildFilePath,
  isPathOwnedBy,
  MAX_FILENAME_LENGTH,
  MAX_PATH_LENGTH,
  ownerPrefix,
  parseFilePath,
} from './file-path';

const USER = '01HXYZUSR00000000000000000';

describe('buildFilePath', () => {
  it('produces a path scoped to user and category', () => {
    const result = buildFilePath({
      userId: USER,
      category: 'attachments',
      filename: 'Report Final.pdf',
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toMatch(
      new RegExp(`^${USER}/attachments/[a-z0-9-]+-report-final\\.pdf$`),
    );
  });

  it('slugifies special characters and lowercases the filename', () => {
    const result = buildFilePath({
      userId: USER,
      category: 'avatars',
      filename: 'Über_Photo (1).PNG',
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.endsWith('uber-photo-1.png')).toBe(true);
  });

  it('rejects empty filename', () => {
    const result = buildFilePath({
      userId: USER,
      category: 'attachments',
      filename: '   ',
    });
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('validation');
  });

  it('rejects filename whose slug is empty', () => {
    const result = buildFilePath({
      userId: USER,
      category: 'attachments',
      filename: '!!!',
    });
    expect(result.isErr()).toBe(true);
  });

  it('rejects empty userId', () => {
    const result = buildFilePath({
      userId: '',
      category: 'attachments',
      filename: 'a.txt',
    });
    expect(result.isErr()).toBe(true);
  });

  it('truncates a very long filename to MAX_FILENAME_LENGTH', () => {
    const filename = `${'a'.repeat(400)}.txt`;
    const result = buildFilePath({
      userId: USER,
      category: 'exports',
      filename,
    });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    const tail = result.value.split('/').at(-1) ?? '';
    expect(tail.length).toBeLessThanOrEqual(MAX_FILENAME_LENGTH);
  });
});

describe('parseFilePath', () => {
  it('accepts a well-formed path', () => {
    const raw = `${USER}/attachments/abc-123-file.pdf`;
    const result = parseFilePath(raw);
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toBe(raw);
  });

  it('rejects path traversal', () => {
    expect(parseFilePath(`${USER}/../etc/passwd`).isErr()).toBe(true);
    expect(parseFilePath(`${USER}/attachments/../other/x.pdf`).isErr()).toBe(
      true,
    );
  });

  it('rejects a leading slash', () => {
    expect(parseFilePath(`/${USER}/attachments/x.pdf`).isErr()).toBe(true);
  });

  it('rejects a trailing slash', () => {
    expect(parseFilePath(`${USER}/attachments/x.pdf/`).isErr()).toBe(true);
  });

  it('rejects backslashes', () => {
    expect(parseFilePath(`${USER}\\attachments\\x.pdf`).isErr()).toBe(true);
  });

  it('rejects control characters', () => {
    expect(parseFilePath(`${USER}/attachments/x\x00.pdf`).isErr()).toBe(true);
  });

  it('rejects a space', () => {
    expect(parseFilePath(`${USER}/attachments/x .pdf`).isErr()).toBe(true);
  });

  it('rejects empty string', () => {
    expect(parseFilePath('').isErr()).toBe(true);
  });

  it('rejects paths longer than MAX_PATH_LENGTH', () => {
    const long = `${USER}/attachments/${'a'.repeat(MAX_PATH_LENGTH)}.txt`;
    expect(parseFilePath(long).isErr()).toBe(true);
  });
});

describe('isPathOwnedBy', () => {
  it('returns true when path belongs to the given user', () => {
    const built = buildFilePath({
      userId: USER,
      category: 'attachments',
      filename: 'doc.pdf',
    });
    expect(built.isOk()).toBe(true);
    if (built.isErr()) return;
    expect(
      isPathOwnedBy({
        path: built.value,
        userId: USER,
      }),
    ).toBe(true);
  });

  it('returns false when user does not match', () => {
    const built = buildFilePath({
      userId: USER,
      category: 'attachments',
      filename: 'doc.pdf',
    });
    if (built.isErr()) return;
    expect(
      isPathOwnedBy({
        path: built.value,
        userId: '01HXYZOTHER000000000000000',
      }),
    ).toBe(false);
  });
});

describe('ownerPrefix', () => {
  it('returns a slash-terminated prefix for the user root', () => {
    expect(ownerPrefix({ userId: USER })).toBe(`${USER}/`);
  });

  it('returns a slash-terminated prefix scoped to a category', () => {
    expect(ownerPrefix({ userId: USER, category: 'attachments' })).toBe(
      `${USER}/attachments/`,
    );
  });

  it('does not let one userId prefix-match another', () => {
    const similarOtherUser = `${USER}2`;
    expect(similarOtherUser.startsWith(ownerPrefix({ userId: USER }))).toBe(
      false,
    );
  });
});
