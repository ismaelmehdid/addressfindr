import { describe, expect, it } from 'vitest';
import { generateCollectionName } from './collection-name';

describe('generateCollectionName', () => {
  it('uses slugified organization name when present', () => {
    const name = generateCollectionName({
      organizationId: 'org-abc123def456',
      organizationName: 'Café de la Gare',
    });
    expect(name).toBe('cafe-de-la-gare-org-abc1');
  });

  it('keeps stable when called twice with same args', () => {
    const args = {
      organizationId: 'org-12345678',
      organizationName: 'Test Org',
    };
    expect(generateCollectionName(args)).toBe(generateCollectionName(args));
  });

  it('strips diacritics and lower-cases', () => {
    const name = generateCollectionName({
      organizationId: 'orgabcdef',
      organizationName: 'Étoile Spéciale',
    });
    expect(name.startsWith('etoile-speciale')).toBe(true);
  });

  it('truncates long names to 30 chars', () => {
    const name = generateCollectionName({
      organizationId: 'orgabcdef',
      organizationName: 'A'.repeat(100),
    });
    const slugPart = name.split('-').slice(0, -1).join('-');
    expect(slugPart.length).toBeLessThanOrEqual(30);
  });

  it('falls back to deterministic hash when no name given', () => {
    const a = generateCollectionName({
      organizationId: 'org-xyz12345',
      organizationName: null,
    });
    const b = generateCollectionName({
      organizationId: 'org-xyz12345',
      organizationName: null,
    });
    expect(a).toBe(b);
    expect(a.startsWith('app-entities-')).toBe(true);
  });

  it('falls back to hash when name slugifies to empty', () => {
    const name = generateCollectionName({
      organizationId: 'org-12345678',
      organizationName: '   !!!   ',
    });
    expect(name.startsWith('app-entities-')).toBe(true);
  });

  it('different orgs without names get different collection names', () => {
    expect(
      generateCollectionName({
        organizationId: 'org-aaa11111',
        organizationName: null,
      }),
    ).not.toBe(
      generateCollectionName({
        organizationId: 'org-bbb22222',
        organizationName: null,
      }),
    );
  });
});
