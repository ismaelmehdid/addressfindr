// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AddressCandidate,
  AddressMatch,
  DpeRecord,
} from '@/core/ademe/types';
import {
  EMPTY_EXTRACTED_VALUES,
  EXTRACTED_FIELD_NAMES,
  type ExtractedListing,
} from '@/core/listing/types';
import messages from '@/i18n/messages/fr.json';
import { ResultsWorkspace } from './results-workspace';

// why: tells React that act() drives the updates, so it flushes them there.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// why: jsdom implements neither; every media query matches, so the view lays
// itself out as on a wide screen (lg and xl).
HTMLElement.prototype.scrollIntoView = vi.fn();
window.matchMedia = (query: string): MediaQueryList => ({
  matches: true,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});

function candidate(dpeNumber: string, confidence: number): AddressCandidate {
  const record: DpeRecord = {
    dpeNumber,
    dataset: 'existing',
    banId: '69383_4180_00016',
    address: '16 Rue Lavoisier 69003 Lyon',
    streetNumber: '16',
    street: 'Rue Lavoisier',
    postalCode: '69003',
    city: 'Lyon',
    inseeCode: '69383',
    propertyType: 'apartment',
    surfaceM2: 63,
    dpeClass: 'D',
    gesClass: 'D',
    dpeKwhM2Year: 210,
    gesKgCo2M2Year: 40,
    heatingEnergy: null,
    yearBuilt: 1930,
    buildingFloors: null,
    landSurfaceM2: null,
    floor: 0,
    buildingComplement: null,
    establishedOn: null,
    visitedOn: null,
    annualEnergyCostEur: null,
    geocodingScore: 0.9,
    point: null,
  };
  return {
    record,
    confidence,
    matched: [],
    diverged: [],
    supportingRecords: 1,
  };
}

const FIRST = candidate('2369E0000001A', 0.82);
const SECOND = candidate('2369E0000002B', 0.61);
const THIRD = candidate('2369E0000003C', 0.4);

function match(candidates: readonly AddressCandidate[]): AddressMatch {
  return { candidates, inspected: 40, truncated: false, refusedFor: null };
}

const LISTING: ExtractedListing = {
  fields: {
    ...EMPTY_EXTRACTED_VALUES,
    portal: 'leboncoin',
    canonicalUrl: 'https://www.leboncoin.fr/ad/ventes_immobilieres/1',
    pin: null,
    propertyType: 'apartment',
    surfaceM2: 63,
  },
  sources: Object.fromEntries(
    EXTRACTED_FIELD_NAMES.map((name) => [name, 'hydration' as const]),
  ) as ExtractedListing['sources'],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

// why: the scroll area measures itself in a microtask after mounting; an
// async act() flushes that update too.
async function render(
  props: Partial<ComponentProps<typeof ResultsWorkspace>>,
): Promise<void> {
  await act(async () => {
    root.render(
      <NextIntlClientProvider
        locale="fr"
        messages={messages}
        timeZone="Europe/Paris"
      >
        <ResultsWorkspace
          listing={LISTING}
          match={match([FIRST, SECOND, THIRD])}
          shown={FIRST}
          focusRequest={0}
          detailPreference="open"
          map={{ kind: 'unavailable' }}
          accessToken=""
          streetViewEnabled={false}
          onSelect={() => {}}
          onCloseDetail={() => {}}
          onMapFailure={() => {}}
          onNewSearch={() => {}}
          {...props}
        />
      </NextIntlClientProvider>,
    );
  });
}

function headingRow(): HTMLElement {
  const row = container.querySelector('#results-heading')?.parentElement;
  if (row === null || row === undefined) throw new Error('no results heading');
  return row;
}

function headingPager(): HTMLElement | null {
  return headingRow().querySelector<HTMLElement>('[role="group"]');
}

function pagerButton(label: string): HTMLButtonElement {
  const button = headingPager()?.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (button === null || button === undefined) {
    throw new Error(`no "${label}" button in the heading pager`);
  }
  return button;
}

describe('ResultsWorkspace heading pager', () => {
  it('shows the rank among the results while a detail is open', async () => {
    await render({ shown: SECOND });

    expect(headingPager()?.getAttribute('aria-label')).toBe(
      'Parcourir les résultats',
    );
    expect(headingPager()?.textContent).toBe('2 / 3');
  });

  it('is hidden while no detail is open', async () => {
    await render({ detailPreference: 'closed' });

    expect(headingRow().querySelectorAll('button')).toHaveLength(0);
  });

  it('is hidden when there is a single result', async () => {
    await render({ match: match([FIRST]) });

    expect(headingRow().querySelectorAll('button')).toHaveLength(0);
  });

  it('wraps from the first result to the last', async () => {
    const onSelect = vi.fn();
    await render({ shown: FIRST, onSelect });

    act(() => {
      pagerButton('Résultat précédent').click();
    });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(THIRD.record.dpeNumber);
  });

  it('wraps from the last result to the first', async () => {
    const onSelect = vi.fn();
    await render({ shown: THIRD, onSelect });

    act(() => {
      pagerButton('Résultat suivant').click();
    });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(FIRST.record.dpeNumber);
  });

  it('steps to the neighbours inside the list', async () => {
    const onSelect = vi.fn();
    await render({ shown: SECOND, onSelect });

    act(() => {
      pagerButton('Résultat précédent').click();
      pagerButton('Résultat suivant').click();
    });
    expect(onSelect.mock.calls).toEqual([
      [FIRST.record.dpeNumber],
      [THIRD.record.dpeNumber],
    ]);
  });
});
