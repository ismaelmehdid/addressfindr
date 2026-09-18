import { describe, expect, it } from 'vitest';
import { DEFAULT_MESSAGES_PAGE_SIZE } from './messages-page-size';

describe('DEFAULT_MESSAGES_PAGE_SIZE', () => {
  it('is the canonical 10', () => {
    expect(DEFAULT_MESSAGES_PAGE_SIZE).toBe(10);
  });
});
