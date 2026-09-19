import { NextResponse } from 'next/server';
import {
  MAX_AUDIO_BYTES,
  transcribeAudioForUser,
} from '@/application/transcription/transcribe-audio';
import { validation } from '@/core/errors';
import { requireAuthedRoute } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAuthedRoute({
    rateLimit: 'transcribe',
    event: 'api.transcribe',
  });
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    log.warn('api.transcribe.invalid_form', {
      error: e instanceof Error ? e.message : String(e),
    });
    return jsonError(validation('Expected multipart/form-data', 'body'));
  }

  const file = form.get('audio');
  if (!(file instanceof File)) {
    return jsonError(
      validation('Missing "audio" file field in form data', 'audio'),
    );
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return jsonError(
      validation(
        `Audio is too large (${file.size} bytes, max ${MAX_AUDIO_BYTES}).`,
        'audio',
      ),
    );
  }

  const languageRaw = form.get('language');
  const languageHint =
    typeof languageRaw === 'string' && /^[a-z]{2}$/i.test(languageRaw)
      ? languageRaw.toLowerCase()
      : undefined;

  const buffer = new Uint8Array(await file.arrayBuffer());

  const result = await transcribeAudioForUser({
    audio: buffer,
    mimeType: file.type || 'application/octet-stream',
    filename: file.name || 'audio',
    languageHint,
  });
  if (result.isErr()) {
    log.warn('api.transcribe.failure', {
      code: result.error.code,
      message: result.error.message,
      userId: auth.ctx.userId,
    });
    return jsonError(result.error);
  }

  return NextResponse.json({
    text: result.value.text,
    durationInSeconds: result.value.durationInSeconds,
  });
}
