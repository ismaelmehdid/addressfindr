import { describe, expect, it } from 'vitest';
import { extractJsonLdNodes, mapJsonLdToValues } from './json-ld';

const SELOGER_HTML = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"SeLoger","address":{"@type":"PostalAddress","streetAddress":"2 Rue des Italiens","addressLocality":"Paris","postalCode":"75009"}}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"RealEstateListing","datePosted":"2026-08-18T00:38:00.000Z","name":"Appartement à vendre T4/F4 80 m² 249900 € Hardricourt (78250)","itemOffered":{"@type":"APARTMENT","numberOfRooms":"4","floorSize":{"@type":"QuantitativeValue","value":"80","unitCode":"MTK"}},"offers":{"@type":"Offer","price":"249900","priceCurrency":"EUR"}}</script>
</head><body></body></html>`;

const PAP_HTML = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Vente appartement 2 pièces 32,40 m² Paris 11E (75011)","offers":{"@type":"Offer","price":"365000","priceCurrency":"EUR"},"additionalProperty":[{"@type":"PropertyValue","name":"Surface","value":"32.40","unitCode":"MTK"},{"@type":"PropertyValue","name":"Nombre de pièces","value":2},{"@type":"PropertyValue","name":"Type de bien","value":"Appartement"}],"address":{"@type":"PostalAddress","streetAddress":"Rue Guénot","addressLocality":"Paris 11e","postalCode":"75011","addressCountry":"FR"}}</script>
</head><body></body></html>`;

describe('extractJsonLdNodes', () => {
  it('flattens nested nodes so itemOffered and offers are reachable', () => {
    // Organization (1) + its PostalAddress (1) + RealEstateListing (1)
    // + itemOffered (1) + floorSize (1) + offers (1) = 6
    const nodes = extractJsonLdNodes(SELOGER_HTML);
    expect(nodes).toHaveLength(6);
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

  it('never lets a five-digit price in the title beat the structured postal code', () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Vente maison 5 pièces 120 m² 89000 € Lyon (69001)","offers":{"@type":"Offer","price":"89000"},"address":{"@type":"PostalAddress","addressLocality":"Lyon 1er","postalCode":"69001"}}</script>`;
    const values = mapJsonLdToValues(extractJsonLdNodes(html));
    expect(values.postalCode).toBe('69001');
    expect(values.priceEur).toBe(89000);
  });

  it('still falls back to the title when no structured address exists', () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Apartment","name":"Appartement 2 pièces Hardricourt (78250)"}</script>`;
    const values = mapJsonLdToValues(extractJsonLdNodes(html));
    expect(values.postalCode).toBe('78250');
    expect(values.propertyType).toBe('apartment');
  });

  it.each([
    ['T2 45 m² 72000 € Hardricourt (78250)', '78250'],
    ['Vente maison 5 pièces 120 m² 89000 € Lyon (69001)', '69001'],
  ])('takes only the parenthesised code from the title %s, never a price', (title, expected) => {
    const values = mapJsonLdToValues([
      { '@type': 'RealEstateListing', name: title },
    ]);
    expect(values.postalCode).toBe(expected);
  });

  it('leaves the postal code absent when the title has no parenthesised code', () => {
    const values = mapJsonLdToValues([
      {
        '@type': 'RealEstateListing',
        name: 'Appartement 3 pièces 65 m² 72000 € Le Mans',
      },
    ]);
    expect(values.postalCode).toBeUndefined();
    expect(values.propertyType).toBe('apartment');
  });

  it.each([
    '0',
    '2500',
  ])('drops an out-of-bounds floorSize of %s and keeps the rest of the listing', (floorSize) => {
    const values = mapJsonLdToValues([
      {
        '@type': 'Apartment',
        floorSize: { '@type': 'QuantitativeValue', value: floorSize },
        numberOfRooms: '3',
      },
      { '@type': 'Offer', price: '249900' },
    ]);
    expect(values.surfaceM2).toBeUndefined();
    expect(values.rooms).toBe(3);
    expect(values.priceEur).toBe(249900);
  });

  it.each([
    ['rooms', { numberOfRooms: '45' }],
    ['bedrooms', { numberOfBedrooms: '40' }],
    ['yearBuilt', { yearBuilt: '1066' }],
  ] as const)('drops an out-of-bounds %s', (field, node) => {
    const values = mapJsonLdToValues([
      { '@type': 'Apartment', floorSize: '60', ...node },
    ]);
    expect(values[field]).toBeUndefined();
    expect(values.surfaceM2).toBe(60);
  });

  it('drops an out-of-bounds offer price', () => {
    const values = mapJsonLdToValues([
      { '@type': 'Apartment', floorSize: '60' },
      { '@type': 'Offer', price: '5' },
    ]);
    expect(values.priceEur).toBeUndefined();
    expect(values.surfaceM2).toBe(60);
  });

  it('drops an out-of-bounds surface from additionalProperty', () => {
    const values = mapJsonLdToValues([
      {
        '@type': 'Product',
        additionalProperty: [
          { name: 'Surface', value: '2500' },
          { name: 'Nombre de pièces', value: 99 },
          { name: 'Type de bien', value: 'Appartement' },
        ],
      },
    ]);
    expect(values.surfaceM2).toBeUndefined();
    expect(values.rooms).toBeUndefined();
    expect(values.propertyType).toBe('apartment');
  });

  it.each([
    ['Surface du terrain', '850'],
    ['Surface du jardin', '300'],
    ['Surface de la parcelle', '1200'],
    ['Surface du balcon', '8'],
  ])('never reads the living surface from a "%s" property', (name, value) => {
    const values = mapJsonLdToValues([
      {
        '@type': 'Product',
        additionalProperty: [
          { name, value },
          { name: 'Surface', value: '45' },
        ],
      },
    ]);
    expect(values.surfaceM2).toBe(45);
  });
});
