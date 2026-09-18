import { describe, expect, it } from 'vitest';
import { validateListingUrl } from './validate-listing-url';

describe('validateListingUrl', () => {
  it('accepts a supported portal url and returns its canonical form', () => {
    expect(
      validateListingUrl(
        '  https://www.seloger.com/annonce/achat/x/2639Z8NG95GB?utm_source=ads  ',
      ),
    ).toEqual({
      ok: true,
      portal: 'seloger',
      canonicalUrl: 'https://www.seloger.com/annonce/achat/x/2639Z8NG95GB',
    });
  });

  it('resolves a portal reached through a subdomain', () => {
    expect(
      validateListingUrl('https://immobilier.lefigaro.fr/annonces/x-1234'),
    ).toEqual({
      ok: true,
      portal: 'lefigaro-immobilier',
      canonicalUrl: 'https://immobilier.lefigaro.fr/annonces/x-1234',
    });
  });

  it('reports an empty input as empty rather than malformed', () => {
    expect(validateListingUrl('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('reports a malformed url', () => {
    expect(validateListingUrl('not a url')).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('reports a non-https url as malformed', () => {
    expect(validateListingUrl('http://www.pap.fr/annonces/x')).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('reports a valid url on an unsupported portal', () => {
    expect(validateListingUrl('https://example.com/annonces/x')).toEqual({
      ok: false,
      reason: 'unsupported-portal',
    });
  });
});
