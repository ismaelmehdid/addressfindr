import { describe, expect, it } from 'vitest';
import { listingDisplayUrl } from './listing-summary';

describe('listingDisplayUrl', () => {
  it('shows the host without www and the path', () => {
    expect(
      listingDisplayUrl(
        'https://www.leboncoin.fr/ad/ventes_immobilieres/3271621783',
      ),
    ).toBe('leboncoin.fr/ad/ventes_immobilieres/3271621783');
  });

  it('drops a trailing slash, the query and the fragment', () => {
    expect(
      listingDisplayUrl('https://www.pap.fr/annonces/r465201632/?utm=x#top'),
    ).toBe('pap.fr/annonces/r465201632');
  });

  it('shows the host alone for a bare domain', () => {
    expect(listingDisplayUrl('https://www.seloger.com/')).toBe('seloger.com');
  });

  it('has nothing to show for a URL it cannot parse', () => {
    expect(listingDisplayUrl('not a url')).toBeNull();
  });
});
