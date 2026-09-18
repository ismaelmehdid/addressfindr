import 'server-only';

import { err, type Result } from 'neverthrow';
import { type AppError, parseInput } from '@/core/errors';
import type { IWebSearchClient } from '@/core/web-search/ports/web-search-client.port';
import { braveSearchAdapter } from '@/infra/external-apis/brave-search/brave-search-adapter';
import { log } from '@/shared/logger';
import {
  type SearchWebInput,
  SearchWebInputSchema,
  type WebSearchResultDto,
} from './dto';

export async function searchWeb(
  input: SearchWebInput,
  client: IWebSearchClient = braveSearchAdapter,
): Promise<Result<WebSearchResultDto[], AppError>> {
  const parsed = parseInput(
    SearchWebInputSchema,
    input,
    'Invalid search input',
  );
  if (parsed.isErr()) return err(parsed.error);

  const result = await client.search({
    query: parsed.value.query,
    count: parsed.value.count,
  });
  if (result.isErr()) {
    log.warn('searchWeb.failure', {
      code: result.error.code,
      message: result.error.message,
    });
    return err(result.error);
  }
  return result;
}
