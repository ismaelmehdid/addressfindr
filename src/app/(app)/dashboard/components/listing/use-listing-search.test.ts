import { describe, expect, it } from 'vitest';
import type { AddressMatch } from '@/core/ademe/types';
import {
  EMPTY_EXTRACTED_VALUES,
  EXTRACTED_FIELD_NAMES,
  type ExtractedListing,
} from '@/core/listing/types';
import {
  addressMessage,
  isSearching,
  type ListingSearchStatus,
  linkMessage,
  type SearchStep,
  searchMessage,
  searchStep,
} from './use-listing-search';

const LISTING: ExtractedListing = {
  fields: {
    ...EMPTY_EXTRACTED_VALUES,
    portal: 'leboncoin',
    canonicalUrl: 'https://www.leboncoin.fr/ad/ventes_immobilieres/1',
    pin: null,
  },
  sources: Object.fromEntries(
    EXTRACTED_FIELD_NAMES.map((name) => [name, 'hydration' as const]),
  ) as ExtractedListing['sources'],
};

function noAddress(refusedFor: AddressMatch['refusedFor']): AddressMatch {
  return { candidates: [], inspected: 12, truncated: false, refusedFor };
}

describe('searchStep', () => {
  it.each<[string, ListingSearchStatus, SearchStep | null]>([
    ['idle', { kind: 'idle' }, null],
    ['reading the listing', { kind: 'pending' }, 'analyzing'],
    [
      'searching the register',
      { kind: 'extracted', listing: LISTING, match: { kind: 'pending' } },
      'addressSearching',
    ],
    ['failed to read', { kind: 'failed', failure: 'rate-limited' }, null],
    [
      'failed to match',
      {
        kind: 'extracted',
        listing: LISTING,
        match: { kind: 'failed', failure: 'unknown' },
      },
      null,
    ],
    [
      'answered without an address',
      {
        kind: 'extracted',
        listing: LISTING,
        match: { kind: 'found', match: noAddress('insufficient-evidence') },
      },
      null,
    ],
  ])('is %s → %s', (_, status, expected) => {
    expect(searchStep(status)).toBe(expected);
  });
});

describe('isSearching', () => {
  it.each<[string, ListingSearchStatus, boolean]>([
    ['idle', { kind: 'idle' }, false],
    ['reading the listing', { kind: 'pending' }, true],
    [
      'searching the register',
      { kind: 'extracted', listing: LISTING, match: { kind: 'pending' } },
      true,
    ],
    ['failed to read', { kind: 'failed', failure: 'unknown' }, false],
    [
      'failed to match',
      {
        kind: 'extracted',
        listing: LISTING,
        match: { kind: 'failed', failure: 'unavailable' },
      },
      false,
    ],
    [
      'answered without an address',
      {
        kind: 'extracted',
        listing: LISTING,
        match: { kind: 'found', match: noAddress(null) },
      },
      false,
    ],
  ])('is %s → %s', (_, status, expected) => {
    expect(isSearching(status)).toBe(expected);
  });
});

describe('searchMessage', () => {
  it('says nothing while idle', () => {
    expect(searchMessage({ status: { kind: 'idle' }, rejection: null })).toBe(
      null,
    );
  });

  it('puts a rejected link before any earlier outcome', () => {
    expect(
      searchMessage({
        status: { kind: 'failed', failure: 'rate-limited' },
        rejection: 'unsupported-portal',
      }),
    ).toEqual({ key: 'errorUnsupportedPortal', tone: 'error' });
  });

  it('follows the search through reading and matching', () => {
    expect(
      searchMessage({ status: { kind: 'pending' }, rejection: null }),
    ).toEqual({ key: 'analyzing', tone: 'neutral' });
    expect(
      searchMessage({
        status: {
          kind: 'extracted',
          listing: LISTING,
          match: { kind: 'pending' },
        },
        rejection: null,
      }),
    ).toEqual({ key: 'addressSearching', tone: 'neutral' });
  });

  it('names the failure of each step as an error', () => {
    expect(
      searchMessage({
        status: { kind: 'failed', failure: 'not-extractable' },
        rejection: null,
      }),
    ).toEqual({ key: 'errorNotExtractable', tone: 'error' });
    expect(
      searchMessage({
        status: {
          kind: 'extracted',
          listing: LISTING,
          match: { kind: 'failed', failure: 'not-enough-signal' },
        },
        rejection: null,
      }),
    ).toEqual({ key: 'errorMatchNotEnoughSignal', tone: 'error' });
  });

  it('explains an answer without an address, refused or empty', () => {
    expect(
      searchMessage({
        status: {
          kind: 'extracted',
          listing: LISTING,
          match: { kind: 'found', match: noAddress('insufficient-evidence') },
        },
        rejection: null,
      }),
    ).toEqual({ key: 'addressInsufficientEvidence', tone: 'neutral' });
    expect(
      searchMessage({
        status: {
          kind: 'extracted',
          listing: LISTING,
          match: { kind: 'found', match: noAddress(null) },
        },
        rejection: null,
      }),
    ).toEqual({ key: 'addressNone', tone: 'neutral' });
  });
});

// why: the home page shows the link's own line and the address outcome in
// two places, and a rejected link can sit beside a search still matching.
describe('linkMessage and addressMessage', () => {
  const matching: ListingSearchStatus = {
    kind: 'extracted',
    listing: LISTING,
    match: { kind: 'pending' },
  };

  it('keeps a rejected link and the address search apart', () => {
    expect(linkMessage({ status: matching, rejection: 'malformed' })).toEqual({
      key: 'errorMalformed',
      tone: 'error',
    });
    expect(addressMessage(matching)).toEqual({
      key: 'addressSearching',
      tone: 'neutral',
    });
  });

  it('says nothing about the link once it has been read', () => {
    expect(linkMessage({ status: matching, rejection: null })).toBe(null);
  });

  it('says nothing about an address before the listing is read', () => {
    expect(addressMessage({ kind: 'pending' })).toBe(null);
    expect(addressMessage({ kind: 'failed', failure: 'unknown' })).toBe(null);
  });

  it('describes reading the link and failing to read it', () => {
    expect(
      linkMessage({ status: { kind: 'pending' }, rejection: null }),
    ).toEqual({ key: 'analyzing', tone: 'neutral' });
    expect(
      linkMessage({
        status: { kind: 'failed', failure: 'rate-limited' },
        rejection: null,
      }),
    ).toEqual({ key: 'errorRateLimited', tone: 'error' });
  });
});
