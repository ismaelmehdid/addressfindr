import { describe, expect, it } from 'vitest';
import { resolvePortal } from './portal-registry';

describe('resolvePortal', () => {
  it('resolves a bare domain', () => {
    expect(resolvePortal('leboncoin.fr')).toBe('leboncoin');
  });

  it('resolves a www subdomain', () => {
    expect(resolvePortal('www.seloger.com')).toBe('seloger');
  });

  it('distinguishes the two lefigaro properties', () => {
    expect(resolvePortal('immobilier.lefigaro.fr')).toBe('lefigaro-immobilier');
    expect(resolvePortal('proprietes.lefigaro.fr')).toBe('lefigaro-proprietes');
  });

  it('is case insensitive', () => {
    expect(resolvePortal('WWW.PAP.FR')).toBe('pap');
  });

  it('returns null for an unknown domain', () => {
    expect(resolvePortal('example.com')).toBeNull();
  });

  it('does not match a lookalike suffix', () => {
    expect(resolvePortal('notleboncoin.fr')).toBeNull();
  });
});
