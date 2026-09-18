import 'server-only';

import { err, type Result } from 'neverthrow';
import { type AppError, parseInput } from '@/core/errors';
import type { IUrlFetcherClient } from '@/core/url-fetch/ports/url-fetcher-client.port';
import { urlFetcherAdapter } from '@/infra/external-apis/url-fetcher/url-fetcher-adapter';
import { log } from '@/shared/logger';
import {
  type FetchedUrlDto,
  type FetchUrlInput,
  FetchUrlInputSchema,
} from './dto';

export async function fetchUrl(
  input: FetchUrlInput,
  client: IUrlFetcherClient = urlFetcherAdapter,
): Promise<Result<FetchedUrlDto, AppError>> {
  const parsed = parseInput(FetchUrlInputSchema, input, 'Invalid url input');
  if (parsed.isErr()) return err(parsed.error);

  const result = await client.fetch({ url: parsed.value.url });
  if (result.isErr()) {
    log.warn('fetchUrl.failure', {
      code: result.error.code,
      message: result.error.message,
    });
    return err(result.error);
  }
  return result;
}
