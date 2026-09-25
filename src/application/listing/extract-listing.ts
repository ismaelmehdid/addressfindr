import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { type AppError, parseInput, validation } from '@/core/errors';
import { canonicalizeListingUrl } from '@/core/listing/canonical-url';
import {
  type ExtractionLayer,
  mergeExtractions,
  missingEvidenceFields,
  missingRequiredFields,
  unfilledFields,
} from '@/core/listing/merge-extractions';
import { isUnsupportedCategory } from '@/core/listing/page-guards';
import { resolvePortal } from '@/core/listing/portal-registry';
import type { IListingExtractor } from '@/core/listing/ports/listing-extractor.port';
import type { IListingScraper } from '@/core/listing/ports/listing-scraper.port';
import { resolveQuotedFields } from '@/core/listing/resolve-quoted-fields';
import { extractHydrationPayload } from '@/core/listing/structured/hydration';
import {
  extractJsonLdNodes,
  mapJsonLdToValues,
} from '@/core/listing/structured/json-ld';
import {
  mapHydrationDescription,
  mapHydrationPin,
  mapHydrationToValues,
} from '@/core/listing/structured/portal-mappings';
import { REQUIRED_FIELDS } from '@/core/listing/types';
import { firecrawlScraperAdapter } from '@/infra/external-apis/firecrawl/firecrawl-scraper-adapter';
import { groqListingExtractor } from '@/infra/external-apis/groq/groq-listing-extractor';
import { log } from '@/shared/logger';
import {
  type ExtractedListingDto,
  type ExtractListingInput,
  ExtractListingInputSchema,
} from './dto';

export async function extractListing(
  input: ExtractListingInput,
  deps: {
    scraper?: IListingScraper;
    extractor?: IListingExtractor;
  } = {},
): Promise<Result<ExtractedListingDto, AppError>> {
  const parsed = parseInput(
    ExtractListingInputSchema,
    input,
    'Invalid listing input',
  );
  if (parsed.isErr()) return err(parsed.error);

  const canonicalUrl = canonicalizeListingUrl(parsed.value.url);
  if (!canonicalUrl) {
    return err(validation('Listing url must be a valid https url', 'url'));
  }
  const portal = resolvePortal(new URL(canonicalUrl).hostname);
  if (!portal) {
    return err(validation('Unsupported listing portal', 'url'));
  }

  log.info('listing.extract.start', { portal });

  const scraper = deps.scraper ?? firecrawlScraperAdapter;
  const scraped = await scraper.scrape({ url: canonicalUrl });
  if (scraped.isErr()) {
    log.warn('listing.extract.failed', {
      portal,
      stage: 'scrape',
      code: scraped.error.code,
    });
    return err(scraped.error);
  }

  const hydration = extractHydrationPayload(scraped.value.rawHtml);
  const description = mapHydrationDescription(portal, hydration);
  // why: when the portal hydrates its full description, that text alone
  // carries the DPE date and values; the rest of the markdown is navigation
  // and neighbouring listings. Measured 2026-09-24: leboncoin pages run to
  // 22 000 characters, which overran Groq's 8000 tokens-per-minute tier and
  // failed the whole call, while the description is 700 to 2200.
  const modelSource = description ?? scraped.value.markdown;

  const layers: ExtractionLayer[] = [
    {
      source: 'hydration',
      values: mapHydrationToValues(portal, hydration),
    },
    {
      source: 'json-ld',
      values: mapJsonLdToValues(extractJsonLdNodes(scraped.value.rawHtml)),
    },
  ];

  const structured = mergeExtractions(layers);
  const needsModel =
    missingRequiredFields(structured.values).length > 0 ||
    missingEvidenceFields(structured.values).length > 0;

  if (needsModel) {
    const extractor = deps.extractor ?? groqListingExtractor;
    const quotes = await extractor.extractQuotes({
      markdown: modelSource,
      missing: unfilledFields(structured.values),
    });
    // why: l'echec du modele ne doit pas perdre ce que le structure a deja donne
    if (quotes.isOk()) {
      layers.push({
        source: 'llm',
        values: resolveQuotedFields({
          source: modelSource,
          quotes: quotes.value,
        }),
      });
    } else {
      log.warn('listing.extract.failed', {
        portal,
        stage: 'llm',
        code: quotes.error.code,
      });
    }
  }

  const merged = mergeExtractions(layers);
  const stillMissing = missingRequiredFields(merged.values);

  if (
    merged.values.propertyType === null &&
    isUnsupportedCategory(scraped.value.markdown)
  ) {
    log.warn('listing.extract.failed', {
      portal,
      stage: 'unsupported_category',
    });
    return err(
      validation('This listing is not a dwelling we can match', 'url'),
    );
  }

  if (stillMissing.length === REQUIRED_FIELDS.length) {
    log.warn('listing.extract.failed', { portal, stage: 'unreadable' });
    return err(
      validation('Could not read any required field from this listing', 'url'),
    );
  }

  log.info('listing.extract.success', {
    portal,
    missing: stillMissing.length,
    llmFields: Object.values(merged.sources).filter((s) => s === 'llm').length,
  });

  return ok({
    fields: {
      ...merged.values,
      portal,
      canonicalUrl,
      pin: mapHydrationPin(portal, hydration),
    },
    sources: merged.sources,
  });
}
