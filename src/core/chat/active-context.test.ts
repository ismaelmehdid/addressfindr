import { describe, expect, it } from 'vitest';
import { toolActiveContext } from './active-context';

describe('toolActiveContext', () => {
  it('returns a storage-file ref for searchFileText with a fileId', () => {
    expect(
      toolActiveContext('searchFileText', { fileId: 'file-9', query: 'q' }),
    ).toEqual({ kind: 'storage-file', id: 'file-9' });
  });

  it('returns null for an unknown tool', () => {
    expect(toolActiveContext('webSearch', { fileId: 'x' })).toBeNull();
  });

  it('returns null when the id field is missing', () => {
    expect(toolActiveContext('searchFileText', { query: 'q' })).toBeNull();
  });

  it('returns null when the id is an empty string', () => {
    expect(toolActiveContext('searchFileText', { fileId: '' })).toBeNull();
  });

  it('returns null when input is not an object', () => {
    expect(toolActiveContext('searchFileText', null)).toBeNull();
    expect(toolActiveContext('searchFileText', 'file-1')).toBeNull();
  });
});
