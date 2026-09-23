import * as v from 'valibot';
import { ExtractedListingSchema } from '@/application/listing/dto';
import { type AddressMatch, DPE_REGISTERS } from '@/core/ademe/types';
import { HEATING_ENERGIES } from '@/core/listing/types';

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
  'heatingEnergy',
  'yearBuilt',
  'buildingFloors',
  'landSurfaceM2',
  'floor',
]);

const DpeRecordSchema = v.object({
  dpeNumber: v.string(),
  dataset: v.picklist(DPE_REGISTERS),
  banId: v.nullable(v.string()),
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
  heatingEnergy: v.nullable(v.picklist(HEATING_ENERGIES)),
  yearBuilt: v.nullable(v.number()),
  buildingFloors: v.nullable(v.number()),
  landSurfaceM2: v.nullable(v.number()),
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
      supportingRecords: v.number(),
    }),
  ),
  inspected: v.number(),
  truncated: v.boolean(),
  refusedFor: v.nullable(v.picklist(['insufficient-evidence'])),
}) satisfies v.GenericSchema<unknown, AddressMatch>;

export type AddressMatchDto = AddressMatch;
