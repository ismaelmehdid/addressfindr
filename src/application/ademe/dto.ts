import * as v from 'valibot';
import { ExtractedListingSchema } from '@/application/listing/dto';
import type { AddressMatch } from '@/core/ademe/types';

export const FindAddressCandidatesInputSchema = v.object({
  listing: ExtractedListingSchema,
});

export type FindAddressCandidatesInput = v.InferOutput<
  typeof FindAddressCandidatesInputSchema
>;

const MatchSignalSchema = v.picklist([
  'surfaceM2',
  'dpeClass',
  'gesClass',
  'dpeKwhM2Year',
  'gesKgCo2M2Year',
  'yearBuilt',
  'floor',
]);

const DpeRecordSchema = v.object({
  dpeNumber: v.string(),
  address: v.string(),
  streetNumber: v.nullable(v.string()),
  street: v.nullable(v.string()),
  postalCode: v.nullable(v.string()),
  city: v.nullable(v.string()),
  inseeCode: v.string(),
  propertyType: v.nullable(v.picklist(['apartment', 'house'])),
  surfaceM2: v.nullable(v.number()),
  dpeClass: v.nullable(v.picklist(['A', 'B', 'C', 'D', 'E', 'F', 'G'])),
  gesClass: v.nullable(v.picklist(['A', 'B', 'C', 'D', 'E', 'F', 'G'])),
  dpeKwhM2Year: v.nullable(v.number()),
  gesKgCo2M2Year: v.nullable(v.number()),
  yearBuilt: v.nullable(v.number()),
  floor: v.nullable(v.number()),
  buildingComplement: v.nullable(v.string()),
  establishedOn: v.nullable(v.string()),
  geocodingScore: v.nullable(v.number()),
});

export const AddressMatchSchema = v.object({
  candidates: v.array(
    v.object({
      record: DpeRecordSchema,
      confidence: v.number(),
      matched: v.array(MatchSignalSchema),
      diverged: v.array(MatchSignalSchema),
    }),
  ),
  inspected: v.number(),
  truncated: v.boolean(),
}) satisfies v.GenericSchema<unknown, AddressMatch>;

export type AddressMatchDto = AddressMatch;
