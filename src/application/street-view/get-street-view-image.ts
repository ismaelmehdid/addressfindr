import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { type AppError, parseInput } from '@/core/errors';
import type { IStreetViewImagery } from '@/core/street-view/ports/street-view-imagery.port';
import type { StreetViewImage } from '@/core/street-view/types';
import { googleStreetViewImagery } from '@/infra/external-apis/google-street-view/google-street-view-imagery';
import { log } from '@/shared/logger';
import {
  type GetStreetViewImageInput,
  GetStreetViewImageInputSchema,
} from './dto';

export async function getStreetViewImage(
  input: GetStreetViewImageInput,
  deps: { imagery?: IStreetViewImagery } = {},
): Promise<Result<StreetViewImage | null, AppError>> {
  const parsed = parseInput(
    GetStreetViewImageInputSchema,
    input,
    'Invalid Street View point',
  );
  if (parsed.isErr()) return err(parsed.error);

  log.info('street_view.image.start');
  const imagery = deps.imagery ?? googleStreetViewImagery;
  const found = await imagery.imageToward(parsed.value);
  if (found.isErr()) {
    log.warn('street_view.image.failed', {
      code: found.error.code,
      message: found.error.message,
    });
    return err(found.error);
  }

  log.info('street_view.image.success', { available: found.value !== null });
  return ok(found.value);
}
