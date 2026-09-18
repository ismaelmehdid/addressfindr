import 'server-only';

import { promises as dns } from 'node:dns';
import { err, ok, type Result } from 'neverthrow';
import {
  type AppError,
  externalApi,
  forbidden,
  validation,
} from '@/core/errors';
import type { IUrlFetcherClient } from '@/core/url-fetch/ports/url-fetcher-client.port';
import {
  checkUrlScheme,
  isPrivateIpAddress,
} from '@/core/url-fetch/services/ssrf-guard';
import {
  type FetchedUrlContent,
  type FetchUrlInput,
  URL_FETCH_ALLOWED_MEDIA_TYPES,
  URL_FETCH_MAX_BYTES,
  URL_FETCH_TIMEOUT_MS,
  type UrlFetchAllowedMediaType,
} from '@/core/url-fetch/types';
import { log } from '@/shared/logger';

const PROVIDER = 'url-fetcher';

function isAllowedMediaType(value: string): value is UrlFetchAllowedMediaType {
  return (URL_FETCH_ALLOWED_MEDIA_TYPES as readonly string[]).includes(value);
}

function parseMediaType(header: string | null): string {
  if (!header) return '';
  const [mime] = header.split(';');
  return mime?.trim().toLowerCase() ?? '';
}

async function resolveAndCheck(
  hostname: string,
): Promise<Result<void, AppError>> {
  if (isPrivateIpAddress(hostname)) {
    return err(forbidden('URL hostname resolves to a private address'));
  }
  try {
    const records = await dns.lookup(hostname, { all: true });
    for (const r of records) {
      if (isPrivateIpAddress(r.address)) {
        return err(forbidden('URL hostname resolves to a private address'));
      }
    }
    return ok(undefined);
  } catch {
    return err(externalApi(PROVIDER, 'DNS lookup failed'));
  }
}

async function fetchUrl(
  input: FetchUrlInput,
): Promise<Result<FetchedUrlContent, AppError>> {
  const check = checkUrlScheme(input.url);
  if (!check.ok) return err(validation(check.reason, 'url'));

  const dnsCheck = await resolveAndCheck(check.url.hostname);
  if (dnsCheck.isErr()) return err(dnsCheck.error);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);

  log.info('url-fetcher.request', { host: check.url.hostname });

  try {
    const res = await fetch(check.url, {
      method: 'GET',
      headers: {
        accept:
          'text/html, text/plain, text/markdown, application/json, application/xml, application/xhtml+xml',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!res.ok) {
      return err(externalApi(PROVIDER, `HTTP ${res.status}`));
    }

    const finalUrl = res.url || check.url.toString();
    const finalParsed = checkUrlScheme(finalUrl);
    if (!finalParsed.ok) {
      return err(forbidden('Redirect target is not allowed'));
    }
    const finalDns = await resolveAndCheck(finalParsed.url.hostname);
    if (finalDns.isErr()) return err(finalDns.error);

    const mediaType = parseMediaType(res.headers.get('content-type'));
    if (!isAllowedMediaType(mediaType)) {
      return err(
        validation(
          `Unsupported media type: ${mediaType || 'unknown'}`,
          'mediaType',
        ),
      );
    }

    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > URL_FETCH_MAX_BYTES) {
      return err(
        validation(
          `Response exceeds ${URL_FETCH_MAX_BYTES} bytes`,
          'sizeBytes',
        ),
      );
    }

    const reader = res.body?.getReader();
    if (!reader) {
      return err(externalApi(PROVIDER, 'Empty response body'));
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    let truncated = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > URL_FETCH_MAX_BYTES) {
        truncated = true;
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        break;
      }
      chunks.push(value);
    }

    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const text = buf
      .subarray(0, Math.min(buf.length, URL_FETCH_MAX_BYTES))
      .toString('utf8');

    log.info('url-fetcher.success', {
      host: finalParsed.url.hostname,
      sizeBytes: text.length,
      truncated,
    });

    return ok({
      url: input.url,
      finalUrl,
      mediaType,
      text,
      sizeBytes: text.length,
      truncated,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return err(externalApi(PROVIDER, 'Request timed out'));
    }
    log.error('url-fetcher.exception', e);
    return err(externalApi(PROVIDER, 'Network failure'));
  } finally {
    clearTimeout(timeout);
  }
}

export const urlFetcherAdapter: IUrlFetcherClient = { fetch: fetchUrl };
