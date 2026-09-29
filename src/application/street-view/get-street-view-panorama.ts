import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { type AppError, parseInput } from '@/core/errors';
import { headingToward } from '@/core/street-view/heading-toward';
import type { IStreetViewImagery } from '@/core/street-view/ports/street-view-imagery.port';
import type { StreetViewPanorama } from '@/core/street-view/types';
import { googleStreetViewImagery } from '@/infra/external-apis/google-street-view/google-street-view-imagery';
import { log } from '@/shared/logger';
import { type StreetViewPointInput, StreetViewPointInputSchema } from './dto';

// why: the embedded panorama opens on the card photo's own panorama, facing
// the trusted point as the photo does.
export async function getStreetViewPanorama(
  input: StreetViewPointInput,
  deps: { imagery?: IStreetViewImagery } = {},
): Promise<Result<StreetViewPanorama | null, AppError>> {
  const parsed = parseInput(
    StreetViewPointInputSchema,
    input,
    'Invalid Street View point',
  );
  if (parsed.isErr()) return err(parsed.error);

  log.info('street_view.panorama.start');
  const imagery = deps.imagery ?? googleStreetViewImagery;
  const found = await imagery.panoramaNear(parsed.value);
  if (found.isErr()) {
    log.warn('street_view.panorama.failed', {
      code: found.error.code,
      message: found.error.message,
    });
    return err(found.error);
  }

  log.info('street_view.panorama.success', { available: found.value !== null });
  if (found.value === null) return ok(null);
  return ok({
    panoId: found.value.panoId,
    heading: headingToward({ from: found.value.location, to: parsed.value }),
  });
}
