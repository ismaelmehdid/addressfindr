import * as v from 'valibot';

export const INSEE_CODE_ORIGINS = ['structured', 'quoted'] as const;
export type InseeCodeOrigin = (typeof INSEE_CODE_ORIGINS)[number];

export const ResolveCommuneInputSchema = v.object({
  inseeCode: v.nullable(v.pipe(v.string(), v.maxLength(10))),
  inseeCodeOrigin: v.picklist(INSEE_CODE_ORIGINS),
  postalCode: v.nullable(v.pipe(v.string(), v.regex(/^\d{5}$/))),
  city: v.nullable(v.pipe(v.string(), v.maxLength(200))),
});

export type ResolveCommuneInput = v.InferOutput<
  typeof ResolveCommuneInputSchema
>;
