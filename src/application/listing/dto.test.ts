import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ExtractedListingSchema } from './dto';

const FIELDS = {
  listingId: null,
  transactionType: null,
  propertyType: 'apartment' as const,
  surfaceM2: 63,
  landSurfaceM2: null,
  rooms: null,
  bedrooms: null,
  floor: null,
  buildingFloors: null,
  yearBuilt: null,
  dpeClass: null,
  gesClass: null,
  dpeKwhM2Year: null,
  gesKgCo2M2Year: null,
  heatingEnergy: null,
  annualEnergyCostMinEur: null,
  annualEnergyCostMaxEur: null,
  dpeDate: null,
  city: null,
  postalCode: null,
  inseeCode: null,
  streetAddress: null,
  priceEur: null,
  publishedAt: null,
  portal: 'leboncoin' as const,
  canonicalUrl: 'https://www.leboncoin.fr/ad/ventes_immobilieres/1',
  pin: null,
};

const SOURCES = Object.fromEntries(
  Object.keys(FIELDS)
    .filter(
      (key) => key !== 'portal' && key !== 'canonicalUrl' && key !== 'pin',
    )
    .map((key) => [key, 'absent' as const]),
);

function parse(overrides: Record<string, unknown>) {
  return v.safeParse(ExtractedListingSchema, {
    fields: { ...FIELDS, ...overrides },
    sources: SOURCES,
  });
}

describe('ExtractedListingSchema', () => {
  it('accepts a plausible listing', () => {
    expect(parse({}).success).toBe(true);
  });

  // why: /api/listings/match est une route ouverte. Son corps n'a pas traverse
  // le chemin d'extraction, donc les bornes que field-bounds applique a
  // l'extraction doivent etre reappliquees ici. Sans cela une surface de 1 m2
  // produisait la fenetre [-1 TO 3], que l'ADEME rejette en HTTP 400 — et
  // l'utilisateur lisait une panne du registre au lieu d'une saisie invalide.
  it('refuses a surface outside the bounds extraction enforces', () => {
    expect(parse({ surfaceM2: 1 }).success).toBe(false);
    expect(parse({ surfaceM2: 0 }).success).toBe(false);
    expect(parse({ surfaceM2: -50 }).success).toBe(false);
    expect(parse({ surfaceM2: 50_000 }).success).toBe(false);
  });

  it('accepts a surface at the edges of those bounds', () => {
    expect(parse({ surfaceM2: 5 }).success).toBe(true);
    expect(parse({ surfaceM2: 2000 }).success).toBe(true);
  });

  it('refuses an absurd plot area', () => {
    expect(parse({ landSurfaceM2: -1 }).success).toBe(false);
    expect(parse({ landSurfaceM2: 50_000_000 }).success).toBe(false);
  });

  it('still accepts an absent surface', () => {
    expect(parse({ surfaceM2: null }).success).toBe(true);
  });
});
