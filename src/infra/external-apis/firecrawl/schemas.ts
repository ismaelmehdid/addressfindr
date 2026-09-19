import * as v from 'valibot';

export const FirecrawlScrapeResponseSchema = v.object({
  success: v.boolean(),
  data: v.optional(
    v.object({
      markdown: v.optional(v.string(), ''),
      rawHtml: v.optional(v.string(), ''),
      metadata: v.optional(
        v.object({
          sourceURL: v.optional(v.string()),
          url: v.optional(v.string()),
          statusCode: v.optional(v.number()),
        }),
        {},
      ),
    }),
  ),
  error: v.optional(v.string()),
});

export type FirecrawlScrapeResponse = v.InferOutput<
  typeof FirecrawlScrapeResponseSchema
>;
