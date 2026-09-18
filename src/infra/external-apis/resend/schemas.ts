import * as v from 'valibot';

export const ResendSendResponseSchema = v.object({
  id: v.string(),
});

export type ResendSendResponse = v.InferOutput<typeof ResendSendResponseSchema>;
