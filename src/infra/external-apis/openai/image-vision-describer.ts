import 'server-only';

import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { err, ok, type Result } from 'neverthrow';
import { type AppError, externalApi } from '@/core/errors';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

const VISION_INSTRUCTION = `You describe an uploaded image so it becomes searchable in a knowledge base.

Output plain markdown. Be terse. Sections (omit if empty):

## Subject
One sentence: what is this image (photo, document scan, hand-written note, chart, etc.).

## Visible text
Verbatim text visible in the image (labels, handwritten notes, table headers, captions). Preserve language. Bullet list one item per distinct text block. Skip if no text.

## Tabular data
If the image contains a table or grid of values, render as markdown table.

## Notable details
Domain-relevant entities and observations: names, identifiers, measurements, quantities, dates, locations. Bullet list, max 8 items.

Rules: never invent text. If unsure, omit. Use the language visible in the image; default to the chat user's language if no text.`;

export type ImageDescription = {
  readonly markdown: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
};

export async function describeImage(args: {
  base64: string;
  mimeType: string;
  fileId: string;
}): Promise<Result<ImageDescription, AppError>> {
  const model = env().CHEAP_MODEL;
  try {
    const result = await generateText({
      model: openai(model),
      system: VISION_INSTRUCTION,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image.' },
            {
              type: 'image',
              image: `data:${args.mimeType};base64,${args.base64}`,
            },
          ],
        },
      ],
      maxOutputTokens: 700,
      abortSignal: AbortSignal.timeout(30_000),
      maxRetries: 2,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: 'vision.describe',
        metadata: {
          'vision.image_mime_type': args.mimeType,
          'vision.image_base64_length': args.base64.length,
        },
      },
    });
    const md = result.text.trim();
    const usage = {
      model,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    };
    if (md.length === 0) {
      log.warn('image.vision.empty', { fileId: args.fileId });
      return ok({ markdown: '', ...usage });
    }
    return ok({ markdown: md, ...usage });
  } catch (e) {
    log.error('image.vision.failed', e, { fileId: args.fileId });
    return err(
      externalApi(
        'openai',
        `Image vision failed: ${e instanceof Error ? e.message : 'unknown'}`,
      ),
    );
  }
}
