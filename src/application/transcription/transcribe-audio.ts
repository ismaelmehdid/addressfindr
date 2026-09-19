import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { requireUserScope } from '@/application/me/user-scope';
import { type AppError, validation } from '@/core/errors';
import {
  MAX_AUDIO_BYTES,
  MAX_RECORDING_SECONDS,
} from '@/core/transcription/limits';
import { transcribeAudio as transcribeViaOpenAI } from '@/infra/external-apis/openai/transcribe-audio';
import { log } from '@/shared/logger';

export { MAX_AUDIO_BYTES, MAX_RECORDING_SECONDS };

const ALLOWED_MIME_PREFIXES = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/aac',
  'audio/m4a',
];

function isAcceptedMime(mimeType: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
}

export type TranscribeAudioResult = {
  text: string;
  durationInSeconds: number | undefined;
};

export async function transcribeAudioForUser(args: {
  audio: Uint8Array;
  mimeType: string;
  filename: string;
  languageHint?: string;
}): Promise<Result<TranscribeAudioResult, AppError>> {
  const scope = await requireUserScope();
  if (scope.isErr()) return err(scope.error);

  if (args.audio.byteLength === 0) {
    return err(validation('Audio is empty', 'audio'));
  }
  if (args.audio.byteLength > MAX_AUDIO_BYTES) {
    return err(
      validation(
        `Audio is too large (${args.audio.byteLength} bytes, max ${MAX_AUDIO_BYTES}).`,
        'audio',
      ),
    );
  }
  if (!isAcceptedMime(args.mimeType)) {
    return err(
      validation(
        `Unsupported audio MIME type: ${args.mimeType}. Use webm, mp4, mp3, wav, ogg, or m4a.`,
        'mimeType',
      ),
    );
  }

  log.info('transcription.start', {
    userId: scope.value.userId,
    mimeType: args.mimeType,
    bytes: args.audio.byteLength,
  });

  const result = await transcribeViaOpenAI({
    audio: args.audio,
    mimeType: args.mimeType,
    filename: args.filename,
    languageHint: args.languageHint,
  });
  if (result.isErr()) return err(result.error);

  if (
    result.value.durationInSeconds !== undefined &&
    result.value.durationInSeconds > MAX_RECORDING_SECONDS
  ) {
    log.warn('transcription.duration_exceeded', {
      userId: scope.value.userId,
      durationSeconds: result.value.durationInSeconds,
      limitSeconds: MAX_RECORDING_SECONDS,
    });
    return err(
      validation(
        `Audio is too long (${Math.round(result.value.durationInSeconds)}s, max ${MAX_RECORDING_SECONDS}s).`,
        'audio',
      ),
    );
  }

  log.info('transcription.success', {
    userId: scope.value.userId,
    textChars: result.value.text.length,
    durationSeconds: result.value.durationInSeconds,
  });

  return ok({
    text: result.value.text,
    durationInSeconds: result.value.durationInSeconds,
  });
}
