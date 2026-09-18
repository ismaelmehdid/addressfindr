import 'server-only';

import { openai } from '@ai-sdk/openai';
import { experimental_transcribe as transcribe } from 'ai';
import { err, ok, type Result } from 'neverthrow';
import { type AppError, externalApi } from '@/core/errors';
import { log } from '@/shared/logger';

export type Transcription = {
  readonly text: string;
  readonly language: string | undefined;
  readonly durationInSeconds: number | undefined;
};

export async function transcribeAudio(args: {
  audio: Uint8Array;
  mimeType: string;
  filename: string;
  languageHint?: string;
}): Promise<Result<Transcription, AppError>> {
  try {
    const result = await transcribe({
      model: openai.transcription('whisper-1'),
      audio: args.audio,
      abortSignal: AbortSignal.timeout(60_000),
      maxRetries: 2,
      providerOptions: {
        openai: {
          ...(args.languageHint ? { language: args.languageHint } : {}),
        },
      },
    });
    const text = result.text.trim();
    return ok({
      text,
      language: result.language,
      durationInSeconds: result.durationInSeconds,
    });
  } catch (e) {
    log.error('openai.transcribe.failed', e, {
      mimeType: args.mimeType,
      filename: args.filename,
      audioBytes: args.audio.byteLength,
    });
    return err(
      externalApi(
        'openai',
        `Transcription failed: ${e instanceof Error ? e.message : 'unknown'}`,
      ),
    );
  }
}
