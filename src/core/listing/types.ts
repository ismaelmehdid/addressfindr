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

export type ListingFields = ExtractedValues & {
  portal: PortalId;
  canonicalUrl: string;
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
  city: null,
  postalCode: null,
  inseeCode: null,
  streetAddress: null,
  priceEur: null,
  publishedAt: null,
};
