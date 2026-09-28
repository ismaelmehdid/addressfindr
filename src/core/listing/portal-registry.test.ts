import { describe, expect, it } from 'vitest';
import { portalDomain, resolvePortal } from './portal-registry';
import { PORTAL_IDS } from './types';

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

describe('portalDomain', () => {
  it('gives the registered domain of a portal', () => {
    expect(portalDomain('leboncoin')).toBe('leboncoin.fr');
  });

  it('keeps the two lefigaro properties apart', () => {
    expect(portalDomain('lefigaro-immobilier')).toBe('immobilier.lefigaro.fr');
    expect(portalDomain('lefigaro-proprietes')).toBe('proprietes.lefigaro.fr');
  });

  it.each(
    PORTAL_IDS,
  )('gives %s a domain that resolves back to it', (portal) => {
    const domain = portalDomain(portal);

    expect(domain).not.toBeNull();
    expect(resolvePortal(domain ?? '')).toBe(portal);
  });
});
