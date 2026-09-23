import * as v from 'valibot';

export const ResolveCommuneInputSchema = v.object({
  inseeCode: v.nullable(v.pipe(v.string(), v.maxLength(10))),
  postalCode: v.nullable(v.pipe(v.string(), v.regex(/^\d{5}$/))),
  city: v.nullable(v.pipe(v.string(), v.maxLength(200))),
});

export type ResolveCommuneInput = v.InferOutput<
  typeof ResolveCommuneInputSchema
>;
