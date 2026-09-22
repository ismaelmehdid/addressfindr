import * as v from 'valibot';
import {
  ENERGY_CLASSES,
  type ExtractedListing,
  FIELD_SOURCES,
  PORTAL_IDS,
  PROPERTY_TYPES,
  TRANSACTION_TYPES,
} from '@/core/listing/types';

export const ExtractListingInputSchema = v.object({
  url: v.pipe(v.string(), v.minLength(1), v.maxLength(2000)),
});

export type ExtractListingInput = v.InferOutput<
  typeof ExtractListingInputSchema
>;

const FieldSourceSchema = v.picklist(FIELD_SOURCES);

const ListingFieldsSchema = v.object({
  listingId: v.nullable(v.string()),
  transactionType: v.nullable(v.picklist(TRANSACTION_TYPES)),
  propertyType: v.nullable(v.picklist(PROPERTY_TYPES)),
  surfaceM2: v.nullable(v.number()),
  rooms: v.nullable(v.number()),
  bedrooms: v.nullable(v.number()),
  floor: v.nullable(v.number()),
  buildingFloors: v.nullable(v.number()),
  yearBuilt: v.nullable(v.number()),
  dpeClass: v.nullable(v.picklist(ENERGY_CLASSES)),
  gesClass: v.nullable(v.picklist(ENERGY_CLASSES)),
  dpeKwhM2Year: v.nullable(v.number()),
  gesKgCo2M2Year: v.nullable(v.number()),
  city: v.nullable(v.string()),
  postalCode: v.nullable(v.string()),
  inseeCode: v.nullable(v.string()),
  streetAddress: v.nullable(v.string()),
  priceEur: v.nullable(v.number()),
  publishedAt: v.nullable(v.string()),
  portal: v.picklist(PORTAL_IDS),
  canonicalUrl: v.string(),
});

const ListingSourcesSchema = v.object({
  listingId: FieldSourceSchema,
  transactionType: FieldSourceSchema,
  propertyType: FieldSourceSchema,
  surfaceM2: FieldSourceSchema,
  rooms: FieldSourceSchema,
  bedrooms: FieldSourceSchema,
  floor: FieldSourceSchema,
  buildingFloors: FieldSourceSchema,
  yearBuilt: FieldSourceSchema,
  dpeClass: FieldSourceSchema,
  gesClass: FieldSourceSchema,
  dpeKwhM2Year: FieldSourceSchema,
  gesKgCo2M2Year: FieldSourceSchema,
  city: FieldSourceSchema,
  postalCode: FieldSourceSchema,
  inseeCode: FieldSourceSchema,
  streetAddress: FieldSourceSchema,
  priceEur: FieldSourceSchema,
  publishedAt: FieldSourceSchema,
});

export const ExtractedListingSchema = v.object({
  fields: ListingFieldsSchema,
  sources: ListingSourcesSchema,
}) satisfies v.GenericSchema<unknown, ExtractedListing>;

export type ExtractedListingDto = ExtractedListing;
