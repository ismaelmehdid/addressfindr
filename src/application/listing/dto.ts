import * as v from 'valibot';
import {
  ENERGY_COST_BOUNDS,
  LAND_SURFACE_BOUNDS,
  SURFACE_BOUNDS,
} from '@/core/listing/field-bounds';
import {
  ENERGY_CLASSES,
  type ExtractedListing,
  FIELD_SOURCES,
  HEATING_ENERGIES,
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

const EnergyCostSchema = v.pipe(
  v.number(),
  v.minValue(ENERGY_COST_BOUNDS.min),
  v.maxValue(ENERGY_COST_BOUNDS.max),
);

const ListingFieldsSchema = v.object({
  listingId: v.nullable(v.string()),
  transactionType: v.nullable(v.picklist(TRANSACTION_TYPES)),
  propertyType: v.nullable(v.picklist(PROPERTY_TYPES)),
  surfaceM2: v.nullable(
    v.pipe(
      v.number(),
      v.minValue(SURFACE_BOUNDS.min),
      v.maxValue(SURFACE_BOUNDS.max),
    ),
  ),
  landSurfaceM2: v.nullable(
    v.pipe(
      v.number(),
      v.minValue(LAND_SURFACE_BOUNDS.min),
      v.maxValue(LAND_SURFACE_BOUNDS.max),
    ),
  ),
  rooms: v.nullable(v.number()),
  bedrooms: v.nullable(v.number()),
  floor: v.nullable(v.number()),
  buildingFloors: v.nullable(v.number()),
  yearBuilt: v.nullable(v.number()),
  dpeClass: v.nullable(v.picklist(ENERGY_CLASSES)),
  gesClass: v.nullable(v.picklist(ENERGY_CLASSES)),
  dpeKwhM2Year: v.nullable(v.number()),
  gesKgCo2M2Year: v.nullable(v.number()),
  heatingEnergy: v.nullable(v.picklist(HEATING_ENERGIES)),
  annualEnergyCostMinEur: v.nullable(EnergyCostSchema),
  annualEnergyCostMaxEur: v.nullable(EnergyCostSchema),
  dpeDate: v.nullable(v.pipe(v.string(), v.isoDate())),
  city: v.nullable(v.string()),
  postalCode: v.nullable(v.string()),
  inseeCode: v.nullable(v.string()),
  streetAddress: v.nullable(v.string()),
  priceEur: v.nullable(v.number()),
  publishedAt: v.nullable(v.string()),
  portal: v.picklist(PORTAL_IDS),
  canonicalUrl: v.string(),
  pin: v.nullable(
    v.object({
      latitude: v.pipe(v.number(), v.minValue(-90), v.maxValue(90)),
      longitude: v.pipe(v.number(), v.minValue(-180), v.maxValue(180)),
    }),
  ),
});

const ListingSourcesSchema = v.object({
  listingId: FieldSourceSchema,
  transactionType: FieldSourceSchema,
  propertyType: FieldSourceSchema,
  surfaceM2: FieldSourceSchema,
  landSurfaceM2: FieldSourceSchema,
  rooms: FieldSourceSchema,
  bedrooms: FieldSourceSchema,
  floor: FieldSourceSchema,
  buildingFloors: FieldSourceSchema,
  yearBuilt: FieldSourceSchema,
  dpeClass: FieldSourceSchema,
  gesClass: FieldSourceSchema,
  dpeKwhM2Year: FieldSourceSchema,
  gesKgCo2M2Year: FieldSourceSchema,
  heatingEnergy: FieldSourceSchema,
  annualEnergyCostMinEur: FieldSourceSchema,
  annualEnergyCostMaxEur: FieldSourceSchema,
  dpeDate: FieldSourceSchema,
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
