import { describe, expect, it } from 'vitest';
import { extractJsonLdNodes, mapJsonLdToValues } from './json-ld';

const SELOGER_HTML = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"SeLoger","address":"2 Rue des Italiens, 75009 Paris"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"RealEstateListing","datePosted":"2026-08-18T00:38:00.000Z","name":"Appartement à vendre T4/F4 80 m² 249900 € Hardricourt (78250)","itemOffered":{"@type":"APARTMENT","numberOfRooms":"4","floorSize":{"@type":"QuantitativeValue","value":"80","unitCode":"MTK"}},"offers":{"@type":"Offer","price":"249900","priceCurrency":"EUR"}}</script>
</head><body></body></html>`;

const PAP_HTML = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Vente appartement 2 pièces 32,40 m² Paris 11E (75011)","offers":{"@type":"Offer","price":"365000","priceCurrency":"EUR"},"additionalProperty":[{"@type":"PropertyValue","name":"Surface","value":"32.40","unitCode":"MTK"},{"@type":"PropertyValue","name":"Nombre de pièces","value":2},{"@type":"PropertyValue","name":"Type de bien","value":"Appartement"}],"address":{"@type":"PostalAddress","streetAddress":"Rue Guénot","addressLocality":"Paris 11e","postalCode":"75011","addressCountry":"FR"}}</script>
</head><body></body></html>`;

describe('extractJsonLdNodes', () => {
  it('flattens nested nodes so itemOffered and offers are reachable', () => {
    // Organization (1) + RealEstateListing (1) + itemOffered (1)
    // + floorSize (1) + offers (1) = 5
    const nodes = extractJsonLdNodes(SELOGER_HTML);
    expect(nodes).toHaveLength(5);
    const types = nodes.map((n) => String(n['@type'] ?? '').toLowerCase());
    expect(types).toContain('apartment');
    expect(types).toContain('offer');
  });

  it('skips a malformed block without throwing', () => {
    const html = `<script type="application/ld+json">{ oops </script>`;
    expect(extractJsonLdNodes(html)).toHaveLength(0);
  });

  it('returns an empty array when there is no block', () => {
    expect(extractJsonLdNodes('<html></html>')).toHaveLength(0);
  });

  it('drops a bare @graph wrapper and keeps its members', () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"Apartment","numberOfRooms":2},{"@type":"Offer","price":"1"}]}</script>`;
    expect(extractJsonLdNodes(html)).toHaveLength(2);
  });
});

describe('mapJsonLdToValues', () => {
  it('reads surface, rooms and price from a seloger listing', () => {
    const values = mapJsonLdToValues(extractJsonLdNodes(SELOGER_HTML));
    expect(values.surfaceM2).toBe(80);
    expect(values.rooms).toBe(4);
    expect(values.priceEur).toBe(249900);
    expect(values.publishedAt).toBe('2026-08-18T00:38:00.000Z');
  });

  it('never takes the address of the publishing organization', () => {
    const values = mapJsonLdToValues(extractJsonLdNodes(SELOGER_HTML));
    expect(values.streetAddress ?? null).toBeNull();
  });

  it('reads the street address from a pap listing', () => {
    const values = mapJsonLdToValues(extractJsonLdNodes(PAP_HTML));
    expect(values.streetAddress).toBe('Rue Guénot');
    expect(values.postalCode).toBe('75011');
    expect(values.city).toBe('Paris 11e');
  });

  it('reads pap additionalProperty entries', () => {
    const values = mapJsonLdToValues(extractJsonLdNodes(PAP_HTML));
    expect(values.surfaceM2).toBe(32.4);
    expect(values.rooms).toBe(2);
    expect(values.propertyType).toBe('apartment');
  });

  it('returns an empty object when no listing node exists', () => {
    expect(mapJsonLdToValues([])).toEqual({});
  });
});
