import * as v from 'valibot';

export const FetchUrlInputSchema = v.object({
  url: v.pipe(v.string(), v.minLength(1), v.maxLength(2000)),
});

export type FetchUrlInput = v.InferOutput<typeof FetchUrlInputSchema>;

export type FetchedUrlDto = {
  url: string;
  finalUrl: string;
  mediaType: string;
  text: string;
  sizeBytes: number;
  truncated: boolean;
};
