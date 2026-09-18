import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import {
  PageContextKind,
  PageContextSchema,
  parsePathnameToPageContext,
} from './page-context';

describe('parsePathnameToPageContext', () => {
  it('parses storage file pathnames', () => {
    expect(parsePathnameToPageContext('/dashboard/storage/abc123')).toEqual({
      kind: PageContextKind.STORAGE_FILE,
      id: 'abc123',
    });
  });

  it('captures id up to the first /, ?, or #', () => {
    expect(
      parsePathnameToPageContext('/dashboard/storage/file42/preview'),
    ).toEqual({ kind: PageContextKind.STORAGE_FILE, id: 'file42' });
    expect(parsePathnameToPageContext('/dashboard/storage/f9?tab=x')).toEqual({
      kind: PageContextKind.STORAGE_FILE,
      id: 'f9',
    });
    expect(parsePathnameToPageContext('/dashboard/storage/fx#top')).toEqual({
      kind: PageContextKind.STORAGE_FILE,
      id: 'fx',
    });
  });

  it('returns NONE for unknown paths', () => {
    expect(parsePathnameToPageContext('/')).toEqual({
      kind: PageContextKind.NONE,
    });
    expect(parsePathnameToPageContext('/dashboard/other/x')).toEqual({
      kind: PageContextKind.NONE,
    });
  });

  it('returns NONE when path lacks an id segment', () => {
    expect(parsePathnameToPageContext('/dashboard/storage/')).toEqual({
      kind: PageContextKind.NONE,
    });
  });
});

describe('PageContextSchema', () => {
  it('accepts valid NONE context', () => {
    expect(v.is(PageContextSchema, { kind: 'none' })).toBe(true);
  });

  it('accepts known kinds with id', () => {
    expect(v.is(PageContextSchema, { kind: 'storage-file', id: 'f1' })).toBe(
      true,
    );
  });

  it('rejects when id is missing or too long', () => {
    expect(v.is(PageContextSchema, { kind: 'storage-file' })).toBe(false);
    expect(
      v.is(PageContextSchema, { kind: 'storage-file', id: 'x'.repeat(101) }),
    ).toBe(false);
  });
});
