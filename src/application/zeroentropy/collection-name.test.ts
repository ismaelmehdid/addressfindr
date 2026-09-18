import { describe, expect, it } from 'vitest';
import { generateCollectionName } from './collection-name';

describe('generateCollectionName', () => {
  it('derives a stable collection name from the user id', () => {
    const name = generateCollectionName({
      userId: 'user-1234abcd',
      userName: null,
    });
    expect(name).toMatch(/^app-entities-user-123-[0-9a-f]{8}$/);
  });

  it('prefers a slug of the user name when present', () => {
    const name = generateCollectionName({
      userId: 'user-1234abcd',
      userName: 'Ismael Mehdid',
    });
    expect(name).toBe('ismael-mehdid-user-123');
  });

  it('keeps stable when called twice with same args', () => {
    const args = { userId: 'user-12345678', userName: 'Test User' };
    expect(generateCollectionName(args)).toBe(generateCollectionName(args));
  });

  it('strips diacritics and lower-cases', () => {
    const name = generateCollectionName({
      userId: 'userabcdef',
      userName: 'Étoile Spéciale',
    });
    expect(name.startsWith('etoile-speciale')).toBe(true);
  });

  it('truncates long names to 30 chars', () => {
    const name = generateCollectionName({
      userId: 'userabcdef',
      userName: 'A'.repeat(100),
    });
    const slugPart = name.split('-').slice(0, -1).join('-');
    expect(slugPart.length).toBeLessThanOrEqual(30);
  });

  it('falls back to deterministic hash when no name given', () => {
    const a = generateCollectionName({
      userId: 'user-xyz12345',
      userName: null,
    });
    const b = generateCollectionName({
      userId: 'user-xyz12345',
      userName: null,
    });
    expect(a).toBe(b);
    expect(a.startsWith('app-entities-')).toBe(true);
  });

  it('falls back to hash when name slugifies to empty', () => {
    const name = generateCollectionName({
      userId: 'user-12345678',
      userName: '   !!!   ',
    });
    expect(name.startsWith('app-entities-')).toBe(true);
  });

  it('different users without names get different collection names', () => {
    expect(
      generateCollectionName({ userId: 'user-aaa11111', userName: null }),
    ).not.toBe(
      generateCollectionName({ userId: 'user-bbb22222', userName: null }),
    );
  });
});
