// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act } from 'react';
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
import { ListingUrlForm } from './listing-url-form';

// why: tells React that act() drives the updates, so it flushes them there.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// why: jsdom implements neither. Every media query matches, so the results
// lay themselves out as on a wide screen, detail panel open.
HTMLElement.prototype.scrollTo = vi.fn();
// why: jsdom has no 2D canvas; without this stub it logs a "not implemented"
// error each time the search progress animation mounts.
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
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

const EXTRACT = '/api/listings/extract';
const MATCH = '/api/listings/match';
const FEEDBACK = '/api/listings/feedback';

const FIRST_URL = 'https://www.leboncoin.fr/ad/ventes_immobilieres/1';
const SECOND_URL = 'https://www.leboncoin.fr/ad/ventes_immobilieres/2';
const MISTYPED_URL = 'https://www.leboncoin.fr/ad/ventes_immobilieres/20';
const FIRST_STREET = 'Rue Lavoisier';
const SECOND_STREET = 'Rue Garibaldi';

function listing(canonicalUrl: string): ExtractedListing {
  return {
    fields: {
      ...EMPTY_EXTRACTED_VALUES,
      portal: 'leboncoin',
      canonicalUrl,
      pin: null,
      propertyType: 'apartment',
      surfaceM2: 63,
    },
    sources: Object.fromEntries(
      EXTRACTED_FIELD_NAMES.map((name) => [name, 'hydration' as const]),
    ) as ExtractedListing['sources'],
  };
}

function candidate(dpeNumber: string, street: string): AddressCandidate {
  const record: DpeRecord = {
    dpeNumber,
    dataset: 'existing',
    banId: '69383_4180_00016',
    address: `16 ${street} 69003 Lyon`,
    streetNumber: '16',
    street,
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
    confidence: 0.82,
    matched: [],
    diverged: [],
    supportingRecords: 1,
  };
}

function found(candidates: AddressCandidate[]): AddressMatch {
  return { candidates, inspected: 40, truncated: false, refusedFor: null };
}

const FIRST_MATCH = found([
  candidate('2369E0000001A', FIRST_STREET),
  candidate('2369E0000001B', 'Rue Paul Bert'),
]);
const SECOND_MATCH = found([candidate('2369E0000002B', SECOND_STREET)]);

type HeldRequest = {
  path: string;
  body: unknown;
  resolve: (response: Response) => void;
};

let held: HeldRequest[] = [];
let container: HTMLDivElement;
let root: Root;

function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

// why: every request stays in flight until the test answers it, so a test
// can act while a search is still running.
beforeEach(() => {
  held = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(
      (path, init) =>
        new Promise<Response>((resolve) => {
          held.push({
            path: String(path),
            body: JSON.parse(String(init?.body)),
            resolve,
          });
        }),
    ),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

function takeRequest(path: string): HeldRequest {
  const index = held.findIndex((request) => request.path === path);
  const request = held[index];
  if (request === undefined) throw new Error(`no request to ${path} in flight`);
  held.splice(index, 1);
  return request;
}

async function answer(
  path: string,
  status: number,
  body: unknown,
): Promise<void> {
  const request = takeRequest(path);
  await act(async () => {
    request.resolve(new Response(JSON.stringify(body), { status }));
    await settle();
  });
}

async function renderForm(): Promise<void> {
  await act(async () => {
    root.render(
      <NextIntlClientProvider
        locale="fr"
        messages={messages}
        timeZone="Europe/Paris"
      >
        <ListingUrlForm
          mapboxAccessToken=""
          streetViewEnabled={false}
          streetViewEmbedKey=""
        />
      </NextIntlClientProvider>,
    );
  });
}

function typeInto(input: HTMLInputElement, text: string): void {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  act(() => {
    setValue?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit(scope: ParentNode): Promise<void> {
  const button = scope.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  );
  if (button === null) throw new Error('no submit button');
  await act(async () => {
    button.click();
    await settle();
  });
}

function resultsColumn(): HTMLElement {
  const column = container.querySelector<HTMLElement>(
    'section[aria-labelledby="results-heading"]',
  );
  if (column === null) throw new Error('no results on screen');
  return column;
}

function buttonNamed(scope: ParentNode, name: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll('button')].find(
    (element) => element.textContent === name,
  );
  if (button === undefined) throw new Error(`no "${name}" button`);
  return button;
}

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

function openDialog(): HTMLElement {
  const element = dialog();
  if (element === null) throw new Error('no dialog open');
  return element;
}

function dialogInput(): HTMLInputElement {
  const input = openDialog().querySelector('input');
  if (input === null) throw new Error('no link field in the dialog');
  return input;
}

function dialogStatus(): string {
  return openDialog().querySelector('[aria-live="polite"]')?.textContent ?? '';
}

function progressOverlay(): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(
      (element) =>
        element.textContent?.includes(messages.Listing.searchProgressTitle),
    ) ?? null
  );
}

function openProgressOverlay(): HTMLElement {
  const overlay = progressOverlay();
  if (overlay === null) throw new Error('no search progress on screen');
  return overlay;
}

function progressStep(): string {
  return (
    openProgressOverlay().querySelector('[aria-live="polite"]')?.textContent ??
    ''
  );
}

async function cancelSearch(): Promise<void> {
  const cancel = buttonNamed(
    openProgressOverlay(),
    messages.Listing.searchCancel,
  );
  await act(async () => {
    cancel.click();
    await settle();
  });
}

function submitLoading(scope: ParentNode): boolean {
  const button = scope.querySelector('button[type="submit"]');
  if (button === null) throw new Error('no submit button');
  return button.hasAttribute('data-loading');
}

async function showFirstResult(): Promise<void> {
  await renderForm();
  const input = container.querySelector('input');
  if (input === null) throw new Error('no link field on the home page');
  typeInto(input, FIRST_URL);
  await submit(container);
  await answer(EXTRACT, 200, listing(FIRST_URL));
  await answer(MATCH, 200, FIRST_MATCH);
  expect(resultsColumn().textContent).toContain(FIRST_STREET);
}

// why: the dialog moves focus to its field in an animation frame.
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

async function pressNewSearch(): Promise<void> {
  const trigger = buttonNamed(
    resultsColumn(),
    messages.Listing.resultsNewSearch,
  );
  await act(async () => {
    trigger.click();
    await settle();
    await nextFrame();
  });
}

async function searchInDialog(url: string): Promise<void> {
  typeInto(dialogInput(), url);
  await submit(openDialog());
}

function closeButton(): HTMLButtonElement {
  const close = openDialog().querySelector<HTMLButtonElement>(
    `button[aria-label="${messages.Listing.newSearchClose}"]`,
  );
  if (close === null) throw new Error('no close button');
  return close;
}

async function pressKey(key: string, target: HTMLElement): Promise<void> {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
    await settle();
  });
}

// why: every way a search in the dialog can end without new results.
const SEARCH_FAILURES: [string, () => Promise<void>, string][] = [
  [
    'the link is rejected',
    async () => {
      await searchInDialog('https://example.com/annonce/1');
    },
    messages.Listing.errorUnsupportedPortal,
  ],
  [
    'the listing cannot be read',
    async () => {
      await searchInDialog(SECOND_URL);
      await answer(EXTRACT, 422, { error: 'validation' });
    },
    messages.Listing.errorNotExtractable,
  ],
  [
    'the register search fails',
    async () => {
      await searchInDialog(SECOND_URL);
      await answer(EXTRACT, 200, listing(SECOND_URL));
      await answer(MATCH, 502, { error: 'external_api' });
    },
    messages.Listing.errorMatchUnavailable,
  ],
  [
    'no address can be named',
    async () => {
      await searchInDialog(SECOND_URL);
      await answer(EXTRACT, 200, listing(SECOND_URL));
      await answer(MATCH, 200, {
        candidates: [],
        inspected: 30,
        truncated: false,
        refusedFor: 'insufficient-evidence',
      });
    },
    messages.Listing.addressInsufficientEvidence,
  ],
];

describe('New search dialog', () => {
  it('opens over the results with an empty, focused link field', async () => {
    await showFirstResult();

    await pressNewSearch();

    expect(openDialog().textContent).toContain(messages.Listing.newSearchTitle);
    expect(openDialog().textContent).toContain(
      messages.Listing.newSearchDescription,
    );
    expect(dialogInput().value).toBe('');
    expect(document.activeElement).toBe(dialogInput());
    expect(resultsColumn().textContent).toContain(FIRST_STREET);
  });

  it('keeps the results on screen and shows progress while the search runs', async () => {
    await showFirstResult();
    await pressNewSearch();

    await searchInDialog(SECOND_URL);
    expect(progressStep()).toBe(messages.Listing.analyzing);
    expect(dialogStatus()).toBe('');
    expect(
      openDialog()
        .querySelector('button[type="submit"]')
        ?.hasAttribute('data-loading'),
    ).toBe(true);

    await answer(EXTRACT, 200, listing(SECOND_URL));
    expect(progressStep()).toBe(messages.Listing.addressSearching);
    expect(dialogStatus()).toBe('');
    expect(
      openDialog()
        .querySelector('button[type="submit"]')
        ?.hasAttribute('data-loading'),
    ).toBe(true);
    expect(resultsColumn().textContent).toContain(FIRST_STREET);
  });

  it('replaces the results, closes and moves focus to the results heading when addresses are found', async () => {
    await showFirstResult();
    await pressNewSearch();

    await searchInDialog(SECOND_URL);
    expect(held.map((request) => request.body)).toEqual([{ url: SECOND_URL }]);
    await answer(EXTRACT, 200, listing(SECOND_URL));
    await answer(MATCH, 200, SECOND_MATCH);

    expect(dialog()).toBeNull();
    expect(resultsColumn().textContent).toContain(SECOND_STREET);
    expect(resultsColumn().textContent).not.toContain(FIRST_STREET);
    expect(document.activeElement).toBe(
      container.querySelector('#results-heading'),
    );
  });

  it.each(
    SEARCH_FAILURES,
  )('keeps the results and explains in the dialog when %s', async (_, fail, message) => {
    await showFirstResult();
    await pressNewSearch();

    await fail();

    expect(dialogStatus()).toBe(message);
    expect(dialogInput().value).not.toBe('');
    expect(
      openDialog()
        .querySelector('button[type="submit"]')
        ?.hasAttribute('data-loading'),
    ).toBe(false);
    expect(resultsColumn().textContent).toContain(FIRST_STREET);
  });

  it('lets the link be corrected and searched again after a failure', async () => {
    await showFirstResult();
    await pressNewSearch();
    await searchInDialog('https://example.com/annonce/1');

    typeInto(dialogInput(), SECOND_URL);
    expect(dialogStatus()).toBe('');
    await submit(openDialog());
    await answer(EXTRACT, 200, listing(SECOND_URL));
    await answer(MATCH, 200, SECOND_MATCH);

    expect(dialog()).toBeNull();
    expect(resultsColumn().textContent).toContain(SECOND_STREET);
  });

  // why: a link corrected while its search runs is the one the user wants;
  // the old search must neither block it nor answer in its place.
  it('abandons the search in flight when the link is edited, so the edited link is searched at once', async () => {
    await showFirstResult();
    await pressNewSearch();
    await searchInDialog(MISTYPED_URL);

    typeInto(dialogInput(), SECOND_URL);
    expect(dialogStatus()).toBe('');
    expect(submitLoading(openDialog())).toBe(false);

    await submit(openDialog());
    expect(held.map((request) => request.body)).toEqual([
      { url: MISTYPED_URL },
      { url: SECOND_URL },
    ]);
    expect(progressStep()).toBe(messages.Listing.analyzing);

    await answer(EXTRACT, 200, listing(MISTYPED_URL));
    expect(held.map((request) => request.body)).toEqual([{ url: SECOND_URL }]);
    expect(progressStep()).toBe(messages.Listing.analyzing);

    await answer(EXTRACT, 200, listing(SECOND_URL));
    await answer(MATCH, 200, SECOND_MATCH);
    expect(dialog()).toBeNull();
    expect(resultsColumn().textContent).toContain(SECOND_STREET);
  });

  it('never shows the answer of a search abandoned by editing the link while it matches', async () => {
    await showFirstResult();
    await pressNewSearch();
    await searchInDialog(MISTYPED_URL);
    await answer(EXTRACT, 200, listing(MISTYPED_URL));

    typeInto(dialogInput(), SECOND_URL);
    await answer(MATCH, 200, SECOND_MATCH);

    expect(dialogStatus()).toBe('');
    expect(dialogInput().value).toBe(SECOND_URL);
    expect(resultsColumn().textContent).toContain(FIRST_STREET);
    expect(resultsColumn().textContent).not.toContain(SECOND_STREET);
  });

  it.each(
    SEARCH_FAILURES,
  )('clears the outcome once the link is edited after %s', async (_, fail) => {
    await showFirstResult();
    await pressNewSearch();
    await fail();

    typeInto(dialogInput(), FIRST_URL);

    expect(dialogStatus()).toBe('');
    expect(dialogInput().getAttribute('aria-invalid')).toBe('false');
  });

  it('keeps the submit button focusable while the search runs, and Escape on it abandons only the search', async () => {
    await showFirstResult();
    await pressNewSearch();
    await searchInDialog(SECOND_URL);

    const button = openDialog().querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    if (button === null) throw new Error('no submit button');
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');

    await submit(openDialog());
    expect(held.filter((request) => request.path === EXTRACT)).toHaveLength(1);

    act(() => {
      button.focus();
    });
    await pressKey('Escape', button);
    expect(progressOverlay()).toBeNull();
    expect(dialogInput().value).toBe(SECOND_URL);
    await answer(EXTRACT, 200, listing(SECOND_URL));
    expect(held).toHaveLength(0);
    expect(resultsColumn().textContent).toContain(FIRST_STREET);
  });

  // why: focus can fall to <body> inside the dialog; a key pressed there is
  // outside its portal and must still leave the results behind it alone.
  it('keeps a key that lands on the page from paging or closing the results behind it', async () => {
    await showFirstResult();
    await pressNewSearch();

    await pressKey('ArrowRight', document.body);
    await pressKey('Escape', document.body);

    expect(container.querySelector('aside')?.getAttribute('aria-label')).toBe(
      'Résultat 1',
    );
  });

  it('ignores the answer of a search abandoned with Escape, and a second Escape closes the dialog', async () => {
    await showFirstResult();
    await pressNewSearch();
    await searchInDialog(SECOND_URL);

    await pressKey('Escape', dialogInput());
    expect(progressOverlay()).toBeNull();
    expect(dialogInput().value).toBe(SECOND_URL);
    expect(dialogStatus()).toBe('');

    await answer(EXTRACT, 200, listing(SECOND_URL));
    expect(held).toHaveLength(0);
    expect(resultsColumn().textContent).toContain(FIRST_STREET);
    expect(resultsColumn().textContent).not.toContain(SECOND_STREET);

    await pressKey('Escape', dialogInput());
    expect(dialog()).toBeNull();
  });

  it('covers the dialog with the search progress, and cancelling keeps the dialog open with its link', async () => {
    await showFirstResult();
    await pressNewSearch();
    await searchInDialog(SECOND_URL);
    expect(progressStep()).toBe(messages.Listing.analyzing);

    await answer(EXTRACT, 200, listing(SECOND_URL));
    expect(progressStep()).toBe(messages.Listing.addressSearching);

    await cancelSearch();
    expect(progressOverlay()).toBeNull();
    expect(dialogInput().value).toBe(SECOND_URL);
    expect(dialogStatus()).toBe('');
    expect(submitLoading(openDialog())).toBe(false);

    await answer(MATCH, 200, SECOND_MATCH);
    expect(resultsColumn().textContent).toContain(FIRST_STREET);
    expect(resultsColumn().textContent).not.toContain(SECOND_STREET);
  });

  it('ignores the answer of a search closed while matching, and reopens empty', async () => {
    await showFirstResult();
    await pressNewSearch();
    await searchInDialog(SECOND_URL);
    await answer(EXTRACT, 200, listing(SECOND_URL));

    const close = closeButton();
    await act(async () => {
      close.click();
      await settle();
    });
    expect(dialog()).toBeNull();

    await answer(MATCH, 200, SECOND_MATCH);
    expect(resultsColumn().textContent).toContain(FIRST_STREET);
    expect(resultsColumn().textContent).not.toContain(SECOND_STREET);

    await pressNewSearch();
    expect(dialogInput().value).toBe('');
    expect(dialogStatus()).toBe('');
  });

  // why: the open detail pages the results on the arrow keys and closes on
  // Escape from a document listener; inside the dialog these keys are its own.
  it('keeps Escape and the arrow keys from reaching the results behind it', async () => {
    await showFirstResult();
    await pressNewSearch();
    const close = closeButton();
    act(() => {
      close.focus();
    });

    await pressKey('ArrowRight', close);
    await pressKey('Escape', close);

    expect(dialog()).toBeNull();
    expect(container.querySelector('aside')?.getAttribute('aria-label')).toBe(
      'Résultat 1',
    );
  });

  it('starts the new results without the verdict given on the previous ones', async () => {
    await showFirstResult();
    const detail = container.querySelector<HTMLElement>('aside');
    if (detail === null) throw new Error('no detail panel');
    await act(async () => {
      buttonNamed(detail, messages.ListingFeedback.confirm).click();
      await settle();
    });
    const verdict = takeRequest(FEEDBACK);
    await act(async () => {
      verdict.resolve(
        new Response(
          JSON.stringify({
            searchId: (verdict.body as { searchId: string }).searchId,
            verdict: 'confirmed',
          }),
        ),
      );
      await settle();
    });
    expect(container.querySelector('aside')?.textContent).toContain(
      messages.ListingFeedback.confirmed,
    );

    await pressNewSearch();
    await searchInDialog(SECOND_URL);
    await answer(EXTRACT, 200, listing(SECOND_URL));
    await answer(MATCH, 200, SECOND_MATCH);

    const newDetail = container.querySelector<HTMLElement>('aside');
    if (newDetail === null) throw new Error('no detail panel');
    expect(newDetail.textContent).not.toContain(
      messages.ListingFeedback.confirmed,
    );
    expect(
      buttonNamed(newDetail, messages.ListingFeedback.confirm),
    ).toBeDefined();
  });
});

describe('Home search form', () => {
  it('covers the page with the search progress until addresses are found', async () => {
    await renderForm();
    expect(progressOverlay()).toBeNull();

    typeInto(homeInput(), FIRST_URL);
    await submit(container);
    expect(progressStep()).toBe(messages.Listing.analyzing);
    expect(container.textContent).not.toContain(messages.Listing.analyzing);

    await answer(EXTRACT, 200, listing(FIRST_URL));
    expect(progressStep()).toBe(messages.Listing.addressSearching);
    expect(container.textContent).not.toContain(
      messages.Listing.addressSearching,
    );

    await answer(MATCH, 200, FIRST_MATCH);
    expect(progressOverlay()).toBeNull();
    expect(resultsColumn().textContent).toContain(FIRST_STREET);
    expect(document.activeElement).toBe(
      container.querySelector('#results-heading'),
    );
  });

  it('cancelling keeps the link, returns focus to it and ignores the late answer', async () => {
    await renderForm();
    typeInto(homeInput(), FIRST_URL);
    await submit(container);

    await cancelSearch();
    expect(progressOverlay()).toBeNull();
    expect(homeInput().value).toBe(FIRST_URL);
    expect(document.activeElement).toBe(homeInput());
    expect(submitLoading(container)).toBe(false);

    await answer(EXTRACT, 200, listing(FIRST_URL));
    expect(held).toHaveLength(0);
    expect(
      container.querySelector('section[aria-labelledby="results-heading"]'),
    ).toBeNull();
  });

  it('focuses the progress itself, so pressing Enter again does not cancel the search', async () => {
    await renderForm();
    typeInto(homeInput(), FIRST_URL);
    await submit(container);
    await act(async () => {
      await nextFrame();
    });

    const overlay = openProgressOverlay();
    expect(document.activeElement).toBe(overlay);
    await pressKey('Enter', overlay);

    expect(progressOverlay()).not.toBeNull();
    expect(held.map((request) => request.path)).toEqual([EXTRACT]);
  });

  it('describes the field with the outcome when no address can be named', async () => {
    await renderForm();
    typeInto(homeInput(), FIRST_URL);
    await submit(container);
    await answer(EXTRACT, 200, listing(FIRST_URL));
    await answer(MATCH, 200, {
      candidates: [],
      inspected: 30,
      truncated: false,
      refusedFor: 'insufficient-evidence',
    });

    expect(progressOverlay()).toBeNull();
    expect(document.activeElement).toBe(homeInput());
    const described = (homeInput().getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    expect(described).toContain(messages.Listing.addressInsufficientEvidence);
  });

  it('removes the search progress when the search fails, and explains under the link', async () => {
    await renderForm();
    typeInto(homeInput(), FIRST_URL);
    await submit(container);

    await answer(EXTRACT, 422, { error: 'validation' });
    expect(progressOverlay()).toBeNull();
    expect(container.textContent).toContain(
      messages.Listing.errorNotExtractable,
    );
    expect(document.activeElement).toBe(homeInput());
  });

  function homeInput(): HTMLInputElement {
    const input = container.querySelector('input');
    if (input === null) throw new Error('no link field on the home page');
    return input;
  }

  it('never shows the addresses of a search superseded by a newer one', async () => {
    await renderForm();
    typeInto(homeInput(), FIRST_URL);
    await submit(container);
    await answer(EXTRACT, 200, listing(FIRST_URL));

    typeInto(homeInput(), SECOND_URL);
    await submit(container);
    await answer(MATCH, 200, FIRST_MATCH);
    expect(
      container.querySelector('section[aria-labelledby="results-heading"]'),
    ).toBeNull();

    await answer(EXTRACT, 200, listing(SECOND_URL));
    await answer(MATCH, 200, SECOND_MATCH);
    expect(resultsColumn().textContent).toContain(SECOND_STREET);
    expect(resultsColumn().textContent).not.toContain(FIRST_STREET);
  });

  it('abandons the search in flight when the link is edited, so the edited link is searched at once', async () => {
    await renderForm();
    typeInto(homeInput(), MISTYPED_URL);
    await submit(container);
    expect(progressStep()).toBe(messages.Listing.analyzing);

    typeInto(homeInput(), SECOND_URL);
    expect(progressOverlay()).toBeNull();
    expect(submitLoading(container)).toBe(false);

    await submit(container);
    expect(held.map((request) => request.body)).toEqual([
      { url: MISTYPED_URL },
      { url: SECOND_URL },
    ]);

    await answer(EXTRACT, 200, listing(MISTYPED_URL));
    expect(held.map((request) => request.body)).toEqual([{ url: SECOND_URL }]);

    await answer(EXTRACT, 200, listing(SECOND_URL));
    await answer(MATCH, 200, SECOND_MATCH);
    expect(resultsColumn().textContent).toContain(SECOND_STREET);
  });

  it('never shows the answer of a search abandoned by editing the link while it matches', async () => {
    await renderForm();
    typeInto(homeInput(), FIRST_URL);
    await submit(container);
    await answer(EXTRACT, 200, listing(FIRST_URL));

    typeInto(homeInput(), SECOND_URL);
    await answer(MATCH, 200, FIRST_MATCH);

    expect(
      container.querySelector('section[aria-labelledby="results-heading"]'),
    ).toBeNull();
    expect(progressOverlay()).toBeNull();
    expect(homeInput().value).toBe(SECOND_URL);
  });

  it('shows the address outcome under its heading until the link is edited', async () => {
    await renderForm();
    typeInto(homeInput(), FIRST_URL);
    await submit(container);
    await answer(EXTRACT, 200, listing(FIRST_URL));
    await answer(MATCH, 502, { error: 'external_api' });

    expect(container.textContent).toContain(messages.Listing.addressHeading);
    expect(container.textContent).toContain(
      messages.Listing.errorMatchUnavailable,
    );

    typeInto(homeInput(), SECOND_URL);

    expect(container.textContent).not.toContain(
      messages.Listing.addressHeading,
    );
    expect(container.textContent).not.toContain(
      messages.Listing.errorMatchUnavailable,
    );
  });

  it('marks the link invalid on a reading failure, and clears it once edited', async () => {
    await renderForm();
    typeInto(homeInput(), FIRST_URL);
    await submit(container);
    await answer(EXTRACT, 422, { error: 'validation' });

    expect(homeInput().getAttribute('aria-invalid')).toBe('true');
    expect(container.textContent).toContain(
      messages.Listing.errorNotExtractable,
    );

    typeInto(homeInput(), SECOND_URL);

    expect(homeInput().getAttribute('aria-invalid')).toBe('false');
    expect(container.textContent).not.toContain(
      messages.Listing.errorNotExtractable,
    );
  });
});
