import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({ NODE_ENV: 'test', VERCEL_ENV: 'development' }),
}));

import { externalApi } from '@/core/errors';
import type { IListingExtractor } from '@/core/listing/ports/listing-extractor.port';
import type { IListingScraper } from '@/core/listing/ports/listing-scraper.port';
import { extractListing } from './extract-listing';

const PAP_HTML = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Vente appartement 2 pièces 32,40 m² Paris 11E (75011)","additionalProperty":[{"@type":"PropertyValue","name":"Surface","value":"32.40"},{"@type":"PropertyValue","name":"Nombre de pièces","value":2},{"@type":"PropertyValue","name":"Type de bien","value":"Appartement"}],"address":{"@type":"PostalAddress","streetAddress":"Rue Guénot","addressLocality":"Paris 11e","postalCode":"75011"}}</script>`;

const PAP_MARKDOWN = `## Paris 11e (75011)
- 2 pièces
- 32,40 m²
Bonne isolation (DPE conforme)
- Rue des Boulets
- Avron`;

function scraper(markdown: string, rawHtml: string): IListingScraper {
  return {
    scrape: async () =>
      ok({ markdown, rawHtml, finalUrl: 'https://www.pap.fr/annonces/x-r1' }),
  };
}

function extractor(quotes: Record<string, string>): IListingExtractor {
  return { extractQuotes: async () => ok(quotes) };
}

describe('extractListing', () => {
  it('rejects an empty url before doing any IO', async () => {
    let called = false;
    const result = await extractListing(
      { url: '' },
      {
        scraper: {
          scrape: async () => {
            called = true;
            return ok({ markdown: '', rawHtml: '', finalUrl: '' });
          },
        },
        extractor: extractor({}),
      },
    );
    expect(result.isErr()).toBe(true);
    expect(called).toBe(false);
  });

  it('rejects a url from an unknown portal', async () => {
    const result = await extractListing(
      { url: 'https://example.com/annonce/1' },
      { scraper: scraper('', ''), extractor: extractor({}) },
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('validation');
  });

  it('prefers the structured street address over the markdown', async () => {
    const result = await extractListing(
      { url: 'https://www.pap.fr/annonces/x-r1' },
      {
        scraper: scraper(PAP_MARKDOWN, PAP_HTML),
        extractor: extractor({ streetAddress: 'Rue des Boulets' }),
      },
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.fields.streetAddress).toBe('Rue Guénot');
      expect(result.value.sources.streetAddress).toBe('json-ld');
    }
  });

  it('marks the DPE absent rather than accepting marketing prose', async () => {
    const result = await extractListing(
      { url: 'https://www.pap.fr/annonces/x-r1' },
      {
        scraper: scraper(PAP_MARKDOWN, PAP_HTML),
        extractor: extractor({ dpeClass: 'Bonne isolation (DPE conforme)' }),
      },
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.fields.dpeClass).toBeNull();
      expect(result.value.sources.dpeClass).toBe('absent');
    }
  });

  it('records the portal and the canonical url', async () => {
    const result = await extractListing(
      { url: 'https://www.pap.fr/annonces/x-r1?utm_source=x' },
      { scraper: scraper(PAP_MARKDOWN, PAP_HTML), extractor: extractor({}) },
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.fields.portal).toBe('pap');
      expect(result.value.fields.canonicalUrl).toBe(
        'https://www.pap.fr/annonces/x-r1',
      );
    }
  });

  it('propagates a scraper failure', async () => {
    const result = await extractListing(
      { url: 'https://www.pap.fr/annonces/x-r1' },
      {
        scraper: { scrape: async () => err(externalApi('firecrawl', 'boom')) },
        extractor: extractor({}),
      },
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('external_api');
  });

  it('still returns structured fields when the model call fails', async () => {
    const result = await extractListing(
      { url: 'https://www.pap.fr/annonces/x-r1' },
      {
        scraper: scraper(PAP_MARKDOWN, PAP_HTML),
        extractor: {
          extractQuotes: async () => err(externalApi('groq', 'down')),
        },
      },
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.fields.surfaceM2).toBe(32.4);
  });

  it('fails as unreadable when no required field could be extracted', async () => {
    const result = await extractListing(
      { url: 'https://www.orpi.com/annonce-x' },
      {
        scraper: scraper('rien d utile ici', '<html></html>'),
        extractor: extractor({}),
      },
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('validation');
  });

  // why: c'est ce garde qui garde le cout marginal a zero sur leboncoin, ou
  // l'hydratation remplit tout. Sans ce test, supprimer le `if` ne casserait
  // rien — le modele serait appele avec un `missing` vide et rendrait {}.
  it('does not call the model when the structured layers fill every required field', async () => {
    const leboncoinHtml = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
      {
        props: {
          pageProps: {
            ad: {
              list_id: 3257628986,
              location: { city: "Saint-Ouen-l'Aumône", zipcode: '95310' },
              attributes: [
                {
                  key: 'real_estate_type',
                  value: '2',
                  value_label: 'Appartement',
                },
                { key: 'square', value: '102' },
                { key: 'rooms', value: '4' },
                { key: 'energy_rate', value: 'b', value_label: 'B' },
              ],
            },
          },
        },
      },
    )}</script>`;

    let calls = 0;
    const result = await extractListing(
      { url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3257628986' },
      {
        scraper: scraper('markdown non utilise', leboncoinHtml),
        extractor: {
          extractQuotes: async () => {
            calls += 1;
            return ok({});
          },
        },
      },
    );

    expect(calls).toBe(0);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.fields.surfaceM2).toBe(102);
      expect(result.value.fields.dpeClass).toBe('B');
      expect(result.value.sources.dpeClass).toBe('hydration');
    }
  });
});
