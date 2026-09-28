import { describe, expect, it } from 'vitest';
import { portalIconUrl } from './portal-icon';
import { portalDomain } from './portal-registry';
import { PORTAL_IDS, type PortalId } from './types';

function iconUrl(portal: PortalId): URL {
  const href = portalIconUrl(portal);
  if (href === null) throw new Error(`no icon URL for ${portal}`);
  return new URL(href);
}

describe('portalIconUrl', () => {
  it('asks Google s2 for the 64 px favicon of the portal domain', () => {
    expect(portalIconUrl('leboncoin')).toBe(
      'https://www.google.com/s2/favicons?domain=leboncoin.fr&sz=64',
    );
  });

  it('sends the portal domain and nothing else', () => {
    const url = iconUrl('lefigaro-immobilier');

    expect(url.origin + url.pathname).toBe(
      'https://www.google.com/s2/favicons',
    );
    expect([...url.searchParams.keys()]).toEqual(['domain', 'sz']);
    expect(url.searchParams.get('domain')).toBe('immobilier.lefigaro.fr');
  });

  it.each(PORTAL_IDS)('has an icon for %s', (portal) => {
    expect(iconUrl(portal).searchParams.get('domain')).toBe(
      portalDomain(portal),
    );
  });
});
