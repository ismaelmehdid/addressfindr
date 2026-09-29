import { describe, expect, it } from 'vitest';
import type { AddressMatch } from '@/core/ademe/types';
import {
  EMPTY_EXTRACTED_VALUES,
  EXTRACTED_FIELD_NAMES,
  type ExtractedListing,
} from '@/core/listing/types';
import {
  isSearching,
  type ListingSearchStatus,
  searchMessage,
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
