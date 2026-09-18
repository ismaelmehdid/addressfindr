import { describe, expect, it } from 'vitest';
import { activeContextRoute } from './chat-context-chip';

describe('activeContextRoute', () => {
  it('maps storage-file to the storage route', () => {
    expect(activeContextRoute('storage-file', '123')).toBe(
      '/dashboard/storage/123',
    );
  });
});
