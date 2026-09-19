import { describe, expect, it } from 'vitest';
import { generateCollectionName } from './collection-name';

describe('generateCollectionName', () => {
  it('derives a stable, hashed collection name from the user id', () => {
    const name = generateCollectionName({ userId: 'user-1234abcd' });
    expect(name).toMatch(/^app-entities-user-123-[0-9a-f]{8}$/);
  });

  it('keeps stable when called twice with the same userId', () => {
    const args = { userId: 'user-12345678' };
    expect(generateCollectionName(args)).toBe(generateCollectionName(args));
  });

  it('different users get different collection names', () => {
    expect(generateCollectionName({ userId: 'user-aaa11111' })).not.toBe(
      generateCollectionName({ userId: 'user-bbb22222' }),
    );
  });
});
