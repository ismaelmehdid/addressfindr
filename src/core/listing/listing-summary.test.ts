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

  it('drops a trailing slash, the tracking parameters and the fragment', () => {
    expect(
      listingDisplayUrl(
        'https://www.pap.fr/annonces/r465201632/?utm_source=x&gclid=1#top',
      ),
    ).toBe('pap.fr/annonces/r465201632');
  });

  it('strips every tracking parameter, whatever its case', () => {
    expect(
      listingDisplayUrl(
        'https://www.seloger.com/annonces/achat/x/2639Z8NG95GB?utm_medium=cpc&utm_campaign=spring&fbclid=a&msclkid=b&mc_cid=c&mc_eid=d&UTM_SOURCE=e&GCLID=f',
      ),
    ).toBe('seloger.com/annonces/achat/x/2639Z8NG95GB');
  });

  it('keeps a parameter that selects the listing', () => {
    expect(
      listingDisplayUrl(
        'https://www.pap.fr/annonces/r465201632?page=2&utm_source=x',
      ),
    ).toBe('pap.fr/annonces/r465201632?page=2');
  });

  it('shows the host alone for a bare domain', () => {
    expect(listingDisplayUrl('https://www.seloger.com/')).toBe('seloger.com');
  });

  it('has nothing to show for a URL it cannot parse', () => {
    expect(listingDisplayUrl('not a url')).toBeNull();
  });
});
