// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as v from 'valibot';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest';
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

// why: jsdom implements neither. Every media query matches unless a test
// narrows the screen, so by default the view lays itself out as on a wide
// screen (lg and xl).
let wideScreen = true;
HTMLElement.prototype.scrollTo = vi.fn();
window.matchMedia = (query: string): MediaQueryList => ({
  matches: wideScreen,
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
          streetViewEmbedKey=""
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

// why: results are browsed from the list and with the arrow keys; no
// "2 / 3" pager sits beside the results heading.
describe('ResultsWorkspace results heading', () => {
  it('shows no pager while a detail is open on several results', async () => {
    await render({ shown: SECOND });

    expect(container.querySelector('#results-heading')?.textContent).toBe(
      messages.Listing.addressHeading,
    );
    expect(resultsColumn().querySelector('[role="group"]')).toBeNull();
    expect(resultsColumn().textContent).not.toContain('2 / 3');
  });
});

// why: the street line is the panel's h2; the header title is its first <p>.
function detailHeader(): HTMLElement {
  const header = container.querySelector('aside p')?.parentElement;
  if (header === null || header === undefined) {
    throw new Error('no detail header');
  }
  return header;
}

function detailButton(label: string): HTMLButtonElement {
  const button = detailHeader().querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (button === null) throw new Error(`no "${label}" button in the detail`);
  return button;
}

describe('ResultsWorkspace detail header', () => {
  it('names the result and offers only the close button', async () => {
    await render({ shown: SECOND });

    expect(container.querySelector('aside')?.getAttribute('aria-label')).toBe(
      'Résultat 2',
    );
    expect(detailHeader().querySelector('p')?.textContent).toBe('Résultat 2');
    expect(detailHeader().textContent).not.toContain('2 / 3');
    expect(
      [...detailHeader().querySelectorAll('button')].map((button) =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual(['Fermer le détail']);
  });

  it('keeps focus on the close button when the shown result changes', async () => {
    await render({ shown: FIRST });
    const close = detailButton('Fermer le détail');
    act(() => {
      close.focus();
    });

    await render({ shown: SECOND });

    expect(document.activeElement).toBe(close);
    expect(detailHeader().querySelector('p')?.textContent).toBe('Résultat 2');
  });
});

function pressKey(key: string, target: Element = document.body): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  });
}

function outsideElement(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  onTestFinished(() => {
    host.remove();
  });
  const element = host.querySelector<HTMLElement>('[data-target]');
  if (element === null) throw new Error('no target element');
  return element;
}

describe('ResultsWorkspace detail shortcuts', () => {
  it('closes the detail on Escape', async () => {
    const onCloseDetail = vi.fn();
    await render({ onCloseDetail });

    pressKey('Escape');
    expect(onCloseDetail).toHaveBeenCalledOnce();
  });

  it('shows the previous and next results on the arrow keys, wrapping around', async () => {
    const onSelect = vi.fn();
    await render({ shown: FIRST, onSelect });

    pressKey('ArrowLeft');
    pressKey('ArrowRight');
    expect(onSelect.mock.calls).toEqual([
      [THIRD.record.dpeNumber],
      [SECOND.record.dpeNumber],
    ]);
  });

  it.each([
    ['a text field', '<textarea data-target></textarea>'],
    [
      'a radio group',
      '<div role="radiogroup"><button role="radio" data-target></button></div>',
    ],
    ['the map', '<div role="application"><div data-target></div></div>'],
  ])('leaves the keys to %s', async (_, html) => {
    const onSelect = vi.fn();
    const onCloseDetail = vi.fn();
    await render({ onSelect, onCloseDetail });
    const target = outsideElement(html);

    pressKey('ArrowLeft', target);
    pressKey('ArrowRight', target);
    pressKey('Escape', target);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onCloseDetail).not.toHaveBeenCalled();
  });

  it('does nothing while no detail is open', async () => {
    const onSelect = vi.fn();
    const onCloseDetail = vi.fn();
    await render({ detailPreference: 'closed', onSelect, onCloseDetail });

    pressKey('ArrowRight');
    pressKey('Escape');
    expect(onSelect).not.toHaveBeenCalled();
    expect(onCloseDetail).not.toHaveBeenCalled();
  });
});

describe('ResultsWorkspace detail sheet below lg', () => {
  // why: jsdom cannot lay out, so this pins the class the sheet's scrolling
  // depends on: the detail's scroll area only scrolls inside a definite height.
  it('gives the bottom sheet a definite height instead of the primitive h-auto', async () => {
    wideScreen = false;
    onTestFinished(() => {
      wideScreen = true;
    });
    await render({});

    const sheet = document.querySelector('[data-slot="sheet-content"]');
    expect(container.querySelector('aside')).toBeNull();
    expect(sheet?.getAttribute('data-side')).toBe('bottom');
    expect(sheet?.classList).toContain('data-[side=bottom]:h-[85svh]');
    expect(sheet?.classList).not.toContain('data-[side=bottom]:h-auto');
  });
});

const FeedbackRequestSchema = v.object({
  searchId: v.string(),
  listingUrl: v.string(),
  verdict: v.string(),
  confirmedDpeNumber: v.nullable(v.string()),
  candidates: v.array(v.object({ dpeNumber: v.string(), score: v.number() })),
});

// why: answers every verdict with the receipt the real route sends back.
function stubFeedbackRoute() {
  const route = vi.fn<typeof fetch>((_path, init) => {
    const request = v.parse(
      FeedbackRequestSchema,
      JSON.parse(String(init?.body)),
    );
    return Promise.resolve(
      new Response(
        JSON.stringify({
          searchId: request.searchId,
          verdict: request.verdict,
        }),
      ),
    );
  });
  vi.stubGlobal('fetch', route);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  return route;
}

// why: a verdict resolves through fetch and response.json(); one macrotask
// inside act() lets that chain and its state updates finish.
async function press(button: HTMLButtonElement | undefined): Promise<void> {
  if (button === undefined) throw new Error('no button to press');
  await act(async () => {
    button.click();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

function resultsColumn(): HTMLElement {
  const column = container.querySelector<HTMLElement>(
    'section[aria-labelledby="results-heading"]',
  );
  if (column === null) throw new Error('no results column');
  return column;
}

function detailPanel(): HTMLElement {
  const panel = container.querySelector<HTMLElement>('aside');
  if (panel === null) throw new Error('no detail panel');
  return panel;
}

function missingListingBox(): HTMLElement {
  const title = [
    ...resultsColumn().querySelectorAll('[data-slot="card-title"]'),
  ].find(
    (element) => element.textContent === messages.ListingFeedback.missingTitle,
  );
  const box = title?.closest<HTMLElement>('[data-slot="card"]');
  if (box === null || box === undefined) {
    throw new Error('no missing-listing box');
  }
  return box;
}

function buttonIn(
  scope: HTMLElement,
  name: string,
): HTMLButtonElement | undefined {
  return [...scope.querySelectorAll('button')].find(
    (button) => button.textContent === name,
  );
}

const CONFIRM = messages.ListingFeedback.confirm;
const NONE_MATCH = messages.ListingFeedback.noneMatch;

describe('ResultsWorkspace feedback', () => {
  it('ends the left column with the missing-listing box, right after the candidate list', async () => {
    await render({});

    const box = missingListingBox();
    expect(box.parentElement?.lastElementChild).toBe(box);
    expect(box.previousElementSibling?.querySelector('h3')?.textContent).toBe(
      messages.Listing.addressTopLabel,
    );
    expect(buttonIn(box, NONE_MATCH)).toBeDefined();
  });

  it('ends the detail with "C’est ce logement"', async () => {
    await render({ shown: SECOND });

    expect(buttonIn(detailPanel(), CONFIRM)).toBeDefined();
  });

  it('sends the shown result with the listing and every candidate on screen', async () => {
    const route = stubFeedbackRoute();
    await render({ shown: SECOND });

    await press(buttonIn(detailPanel(), CONFIRM));

    expect(route).toHaveBeenCalledOnce();
    const [path, init] = route.mock.calls[0] ?? [];
    expect(path).toBe('/api/listings/feedback');
    expect(
      v.parse(FeedbackRequestSchema, JSON.parse(String(init?.body))),
    ).toMatchObject({
      listingUrl: LISTING.fields.canonicalUrl,
      verdict: 'confirmed',
      confirmedDpeNumber: SECOND.record.dpeNumber,
      candidates: [
        { dpeNumber: FIRST.record.dpeNumber, score: FIRST.confidence },
        { dpeNumber: SECOND.record.dpeNumber, score: SECOND.confidence },
        { dpeNumber: THIRD.record.dpeNumber, score: THIRD.confidence },
      ],
    });
  });

  it('withdraws "Aucun emplacement ne correspond" once the detail confirms a result', async () => {
    stubFeedbackRoute();
    await render({ shown: SECOND });

    await press(buttonIn(detailPanel(), CONFIRM));

    expect(detailPanel().textContent).toContain(
      messages.ListingFeedback.confirmed,
    );
    expect(buttonIn(missingListingBox(), NONE_MATCH)).toBeUndefined();
  });

  it('withdraws "C’est ce logement" once no location is reported to match', async () => {
    stubFeedbackRoute();
    await render({});

    await press(buttonIn(missingListingBox(), NONE_MATCH));

    expect(missingListingBox().textContent).toContain(
      messages.ListingFeedback.thanks,
    );
    expect(buttonIn(detailPanel(), CONFIRM)).toBeUndefined();
  });

  it('leaves the keys to the comment field and the reasons of the form', async () => {
    stubFeedbackRoute();
    const onSelect = vi.fn();
    const onCloseDetail = vi.fn();
    await render({ onSelect, onCloseDetail });
    await press(buttonIn(missingListingBox(), NONE_MATCH));

    const comment = missingListingBox().querySelector('textarea');
    const reason = missingListingBox().querySelector('[role="radio"]');
    if (comment === null || reason === null) {
      throw new Error('no none-match form');
    }
    for (const target of [comment, reason]) {
      pressKey('ArrowLeft', target);
      pressKey('ArrowRight', target);
      pressKey('Escape', target);
    }
    expect(onSelect).not.toHaveBeenCalled();
    expect(onCloseDetail).not.toHaveBeenCalled();
  });
});
