import { describe, expect, it } from 'vitest';
import { canonicalizeListingUrl } from './canonical-url';

describe('canonicalizeListingUrl', () => {
  it('strips tracking parameters and the fragment', () => {
    expect(
      canonicalizeListingUrl(
        'https://www.seloger.com/annonce/achat/x/2639Z8NG95GB?serp_view=list&utm_source=ads#ln=results',
      ),
    ).toBe('https://www.seloger.com/annonce/achat/x/2639Z8NG95GB');
  });

  it('keeps meaningful query parameters', () => {
    expect(
      canonicalizeListingUrl('https://www.pap.fr/annonces/x-r465201632?page=2'),
    ).toBe('https://www.pap.fr/annonces/x-r465201632?page=2');
  });

  it('removes a trailing slash from a non-root path', () => {
    expect(
      canonicalizeListingUrl('https://www.orpi.com/annonce-vente-x/'),
    ).toBe('https://www.orpi.com/annonce-vente-x');
  });

  it('rejects a non-https scheme', () => {
    expect(canonicalizeListingUrl('http://www.pap.fr/annonces/x')).toBeNull();
  });

  it('rejects a malformed url', () => {
    expect(canonicalizeListingUrl('not a url')).toBeNull();
  });
});
