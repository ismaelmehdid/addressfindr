import type { GeoPoint } from '@/core/geo/types';

export const ENERGY_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export type EnergyClass = (typeof ENERGY_CLASSES)[number];

export const PORTAL_IDS = [
  'leboncoin',
  'seloger',
  'pap',
  'bienici',
  'century21',
  'orpi',
  'logic-immo',
  'lefigaro-immobilier',
  'lefigaro-proprietes',
  'iadfrance',
  'bellesdemeures',
  'ouestfrance-immo',
  'paruvendu',
  'green-acres',
  'immonot',
  'notaires',
] as const;
export type PortalId = (typeof PORTAL_IDS)[number];

export const TRANSACTION_TYPES = ['sale', 'rent'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const HEATING_ENERGIES = [
  'gas',
  'electricity',
  'district-heating',
  'fuel-oil',
  'wood',
  'lpg',
  'coal',
] as const;
export type HeatingEnergy = (typeof HEATING_ENERGIES)[number];

export const PROPERTY_TYPES = ['apartment', 'house'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export type ExtractedValues = {
  listingId: string | null;
  transactionType: TransactionType | null;
  propertyType: PropertyType | null;
  surfaceM2: number | null;
  landSurfaceM2: number | null;
  rooms: number | null;
  bedrooms: number | null;
  floor: number | null;
  buildingFloors: number | null;
  yearBuilt: number | null;
  dpeClass: EnergyClass | null;
  gesClass: EnergyClass | null;
  dpeKwhM2Year: number | null;
  gesKgCo2M2Year: number | null;
  heatingEnergy: HeatingEnergy | null;
  annualEnergyCostMinEur: number | null;
  annualEnergyCostMaxEur: number | null;
  dpeDate: string | null;
  city: string | null;
  postalCode: string | null;
  inseeCode: string | null;
  streetAddress: string | null;
  priceEur: number | null;
  publishedAt: string | null;
};

export const EXTRACTED_FIELD_NAMES = [
  'listingId',
  'transactionType',
  'propertyType',
  'surfaceM2',
  'landSurfaceM2',
  'rooms',
  'bedrooms',
  'floor',
  'buildingFloors',
  'yearBuilt',
  'dpeClass',
  'gesClass',
  'dpeKwhM2Year',
  'gesKgCo2M2Year',
  'heatingEnergy',
  'annualEnergyCostMinEur',
  'annualEnergyCostMaxEur',
  'dpeDate',
  'city',
  'postalCode',
  'inseeCode',
  'streetAddress',
  'priceEur',
  'publishedAt',
] as const;
export type ExtractedFieldName = (typeof EXTRACTED_FIELD_NAMES)[number];

export const FIELD_SOURCES = ['json-ld', 'hydration', 'llm', 'absent'] as const;
export type FieldSource = (typeof FIELD_SOURCES)[number];

// why: the pin is portal metadata, not a value read on the page. It never
// goes through the model or the precedence merge.
export type ListingFields = ExtractedValues & {
  portal: PortalId;
  canonicalUrl: string;
  pin: GeoPoint | null;
};

export type ExtractedListing = {
  fields: ListingFields;
  sources: Record<ExtractedFieldName, FieldSource>;
};

export const REQUIRED_FIELDS = [
  'surfaceM2',
  'rooms',
  'dpeClass',
  'city',
  'propertyType',
] as const satisfies readonly ExtractedFieldName[];

// why: measured 2026-09-24 on 25 leboncoin listings, structured data always
// fills the required fields, so the model never ran — and these values, which
// live only in the description, were never read. Without them, surface and
// letters alone ranked 17 listings out of 25 at random, at 100 %. Their absence
// alone therefore justifies calling the model.
export const MATCHING_EVIDENCE_FIELDS = [
  'dpeKwhM2Year',
  'gesKgCo2M2Year',
  'heatingEnergy',
  'annualEnergyCostMinEur',
  'annualEnergyCostMaxEur',
  'dpeDate',
] as const satisfies readonly ExtractedFieldName[];

export const LISTING_EXTRACTION_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
] as const;
export type ListingExtractionModel = (typeof LISTING_EXTRACTION_MODELS)[number];

export const MAX_MARKDOWN_CHARS = 40_000;

export const EMPTY_EXTRACTED_VALUES: ExtractedValues = {
  listingId: null,
  transactionType: null,
  propertyType: null,
  surfaceM2: null,
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
};
