// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act, type ComponentProps, type ReactElement, useState } from 'react';
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
import type { MapView } from './map-view';
import { type DetailPreference, ResultsWorkspace } from './results-workspace';

// why: Mapbox needs WebGL, which jsdom lacks. The stand-in keeps the map's
// role and shows which view the workspace asked it to draw.
vi.mock('./address-map', () => ({
  AddressMap: ({ view }: { view: MapView }) => (
    <div role="application" data-view={view} />
  ),
}));

// why: tells React that act() drives the updates, so it flushes them there.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// why: jsdom implements neither. The view lays itself out for a screen this
// many rem wide, past xl (80rem) unless a test narrows it, and the list
// scrolls instantly, as for a user who prefers reduced motion.
const WIDE_SCREEN_REM = 90;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
let screenWidthRem = WIDE_SCREEN_REM;

function queryMatches(query: string): boolean {
  if (query === REDUCED_MOTION_QUERY) return true;
  const width = /\(min-width: ([\d.]+)rem\)/.exec(query)?.[1];
  if (width === undefined) throw new Error(`unexpected media query ${query}`);
  return screenWidthRem >= Number(width);
}

function onScreen(widthRem: number): void {
  screenWidthRem = widthRem;
  onTestFinished(() => {
    screenWidthRem = WIDE_SCREEN_REM;
  });
}

HTMLElement.prototype.scrollTo = vi.fn();
window.matchMedia = (query: string): MediaQueryList => ({
  matches: queryMatches(query),
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

type WorkspaceProps = ComponentProps<typeof ResultsWorkspace>;

const DEFAULT_PROPS: WorkspaceProps = {
  listing: LISTING,
  match: match([FIRST, SECOND, THIRD]),
  shown: FIRST,
  focusRequest: 0,
  detailPreference: 'open',
  map: { kind: 'unavailable' },
  accessToken: '',
  streetViewEnabled: false,
  streetViewEmbedKey: '',
  onSelect: () => {},
  onCloseDetail: () => {},
  onMapFailure: () => {},
  onNewSearch: () => {},
};

// why: mirrors the dashboard, where closing the detail sets the preference to
// 'closed'; the panel then unmounts and the card loses aria-current.
function ClosableWorkspace(props: Partial<WorkspaceProps>) {
  const [detailPreference, setDetailPreference] =
    useState<DetailPreference>('open');
  return (
    <ResultsWorkspace
      {...DEFAULT_PROPS}
      {...props}
      detailPreference={detailPreference}
      onCloseDetail={() => {
        setDetailPreference('closed');
      }}
    />
  );
}

// why: mirrors the dashboard, where picking a result shows it in the detail.
function BrowsableWorkspace({
  first,
  others,
  ...props
}: Partial<WorkspaceProps> & {
  first: AddressCandidate;
  others: readonly AddressCandidate[];
}) {
  const candidates = [first, ...others];
  const [shown, setShown] = useState(first);
  return (
    <ResultsWorkspace
      {...DEFAULT_PROPS}
      {...props}
      match={match(candidates)}
      shown={shown}
      onSelect={(dpeNumber) => {
        setShown(
          candidates.find(
            (candidate) => candidate.record.dpeNumber === dpeNumber,
          ) ?? first,
        );
      }}
    />
  );
}

function withTrustedPoint(shown: AddressCandidate): AddressCandidate {
  return {
    ...shown,
    record: {
      ...shown.record,
      point: { latitude: 45.7578, longitude: 4.8515 },
    },
  };
}

// why: the scroll area measures itself in a microtask after mounting; an
// async act() flushes that update too.
async function mount(workspace: ReactElement): Promise<void> {
  await act(async () => {
    root.render(
      <NextIntlClientProvider
        locale="fr"
        messages={messages}
        timeZone="Europe/Paris"
      >
        {workspace}
      </NextIntlClientProvider>,
    );
  });
}

async function render(props: Partial<WorkspaceProps>): Promise<void> {
  await mount(<ResultsWorkspace {...DEFAULT_PROPS} {...props} />);
}

async function renderClosable(props: Partial<WorkspaceProps>): Promise<void> {
  await mount(<ClosableWorkspace {...props} />);
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

  // why: selecting a result centres it in the list, behind the bottom sheet on
  // a phone; returning focus on close must not scroll the list back up.
  it("returns focus to the shown result's card on close without scrolling the list", async () => {
    await renderClosable({ shown: SECOND });
    const card = shownCardButton();
    const focus = vi.spyOn(card, 'focus');
    const scroll = placeInList(card, VIEWPORT.top + 50);
    focusRingShows(card, true);
    const close = detailButton('Fermer le détail');
    act(() => {
      close.focus();
    });

    await act(async () => {
      close.click();
      await nextFrame();
    });

    expect(container.querySelector('aside')).toBeNull();
    expect(card.getAttribute('aria-current')).toBeNull();
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(document.activeElement).toBe(card);
    expect(scroll).not.toHaveBeenCalled();
  });

  // why: the close button is reached by tabbing past every later card, which
  // scrolls the list until the shown card is out of its view.
  it("brings the shown result's card back into view when the keyboard closes the detail", async () => {
    await renderClosable({ shown: FIRST });
    const card = shownCardButton();
    const scroll = placeInList(card, VIEWPORT.top - 500);
    focusRingShows(card, true);
    const close = detailButton('Fermer le détail');
    act(() => {
      close.focus();
    });

    await act(async () => {
      close.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextFrame();
    });

    expect(container.querySelector('aside')).toBeNull();
    expect(document.activeElement).toBe(card);
    expect(scroll).toHaveBeenCalledExactlyOnceWith({
      top: 50,
      behavior: 'auto',
    });
  });

  // why: the list only moves to show a focus ring, and focus a script moves
  // after a pointer press shows none; the list stays where it was scrolled.
  it('leaves the list where it was scrolled when a mouse closes the detail', async () => {
    await renderClosable({ shown: FIRST });
    const card = shownCardButton();
    const scroll = placeInList(card, VIEWPORT.top - 500);
    focusRingShows(card, false);
    const close = detailButton('Fermer le détail');

    await act(async () => {
      clickWithMouse(close);
      await nextFrame();
    });

    expect(container.querySelector('aside')).toBeNull();
    expect(document.activeElement).toBe(card);
    expect(scroll).not.toHaveBeenCalled();
  });

  // why: a click does not focus a button in Safari, so focus can already sit
  // on <body> when the detail closes.
  it("moves focus that fell to the page to the shown result's card on close", async () => {
    await renderClosable({ shown: SECOND });
    const card = shownCardButton();
    act(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    expect(document.activeElement).toBe(document.body);

    await act(async () => {
      detailButton('Fermer le détail').click();
      await nextFrame();
    });

    expect(container.querySelector('aside')).toBeNull();
    expect(document.activeElement).toBe(card);
  });

  it('leaves focus on the card where Escape closes the detail', async () => {
    const onCloseDetail = vi.fn();
    await render({ shown: SECOND, onCloseDetail });
    const card = otherCardButtons()[1];
    if (card === undefined) throw new Error('no third card');
    const heading = container.querySelector<HTMLElement>('#results-heading');
    if (heading === null) throw new Error('no results heading');
    const headingFocus = vi.spyOn(heading, 'focus');
    act(() => {
      card.focus();
    });

    await act(async () => {
      card.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextFrame();
    });

    expect(onCloseDetail).toHaveBeenCalledOnce();
    expect(headingFocus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(card);
  });
});

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

function rect(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom: top + height,
    left: 0,
    right: 336,
    width: 336,
    height,
    toJSON: () => ({}),
  };
}

// why: jsdom lays nothing out. The list's 400px viewport sits 120px down the
// page, scrolled 600px into 2000px of content, so a mistake in the frame a
// box is measured in moves the scroll target.
const VIEWPORT = { top: 120, height: 400, scrollTop: 600, scrollHeight: 2000 };
const CARD_HEIGHT = 300;

// why: puts the given card at `top` in the page's frame, then watches the
// viewport scroll. The card and its button share one box, as on screen.
function placeInList(
  cardButton: HTMLElement,
  top: number,
): ReturnType<typeof vi.fn> {
  const viewport = resultsColumn().querySelector<HTMLElement>(
    '[data-slot="scroll-area-viewport"]',
  );
  if (viewport === null) throw new Error('no scroll area viewport');
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(
    rect(VIEWPORT.top, VIEWPORT.height),
  );
  for (const [property, value] of [
    ['clientHeight', VIEWPORT.height],
    ['scrollTop', VIEWPORT.scrollTop],
    ['scrollHeight', VIEWPORT.scrollHeight],
  ] as const) {
    Object.defineProperty(viewport, property, { configurable: true, value });
  }
  const card = cardButton.closest<HTMLElement>('[data-slot="card"]');
  if (card === null) throw new Error('no card around the button');
  for (const element of [card, cardButton]) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
      rect(top, CARD_HEIGHT),
    );
  }
  const scroll = vi.fn();
  viewport.scrollTo = scroll;
  return scroll;
}

// why: whether focus moved by a script shows its ring is the browser's call
// (after a key press it does, after a pointer press it does not), and jsdom's
// heuristic ignores the key press. This gives the browser's answer.
function focusRingShows(element: HTMLElement, shows: boolean): void {
  const matches = element.matches.bind(element);
  vi.spyOn(element, 'matches').mockImplementation((selector: string) =>
    selector === ':focus-visible'
      ? shows && document.activeElement === element
      : matches(selector),
  );
}

function clickWithMouse(target: HTMLElement): void {
  target.focus();
  for (const type of ['mousedown', 'mouseup', 'click']) {
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, detail: 1 }),
    );
  }
}

function shownCardButton(): HTMLButtonElement {
  const button = resultsColumn().querySelector<HTMLButtonElement>(
    'button[aria-current="true"]',
  );
  if (button === null) throw new Error('no card marked as shown');
  return button;
}

function otherCardButtons(): HTMLButtonElement[] {
  return [
    ...resultsColumn().querySelectorAll<HTMLButtonElement>(
      'ol > li [data-slot="card"] > button',
    ),
  ];
}

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
    [
      'a toggle group',
      '<div data-slot="toggle-group"><button data-target></button></div>',
    ],
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

  // why: the photo is keyed on the shown result, so paging from the Street
  // View panorama would discard it and drop focus to <body>. The results here
  // page for real, as on the dashboard.
  it('leaves the arrow keys to the Street View panorama instead of paging away from it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ panoId: 'CAoSLEFGMVFpcE1', heading: 212 }),
      ),
    );
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    await mount(
      <BrowsableWorkspace
        first={withTrustedPoint(FIRST)}
        others={[SECOND, THIRD]}
        streetViewEnabled
        streetViewEmbedKey="browser-embed-key"
      />,
    );
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'aside button[aria-label="Explorer le panorama Street View"]',
        )
        ?.click();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    const back = document.activeElement;
    if (back === null) throw new Error('nothing focused');
    expect(back.textContent).toBe('Retour à la photo');

    pressKey('ArrowRight', back);
    pressKey('ArrowLeft', back);

    expect(detailHeader().querySelector('p')?.textContent).toBe('Résultat 1');
    expect(container.querySelector('aside iframe')).not.toBeNull();
    expect(document.activeElement).toBe(back);
  });
});

describe('ResultsWorkspace detail sheet below lg', () => {
  // why: jsdom cannot lay out, so this pins the class the sheet's scrolling
  // depends on: the detail's scroll area only scrolls inside a definite height.
  it('gives the bottom sheet a definite height instead of the primitive h-auto', async () => {
    onScreen(40);
    await render({});

    const sheet = document.querySelector('[data-slot="sheet-content"]');
    expect(container.querySelector('aside')).toBeNull();
    expect(sheet?.getAttribute('data-side')).toBe('bottom');
    expect(sheet?.classList).toContain('data-[side=bottom]:h-[85svh]');
    expect(sheet?.classList).not.toContain('data-[side=bottom]:h-auto');
  });

  // why: Base UI returns focus to where it was before the sheet opened, which
  // is not the result the sheet was showing.
  it.each([
    [
      'its close button',
      (close: HTMLButtonElement): void => {
        close.click();
      },
    ],
    [
      'Escape',
      (close: HTMLButtonElement): void => {
        close.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
          }),
        );
      },
    ],
  ])("returns focus to the shown result's card when the sheet closes on %s", async (_, closeSheet) => {
    onScreen(40);
    await renderClosable({ shown: SECOND });
    const card = shownCardButton();
    const focus = vi.spyOn(card, 'focus');
    const scroll = placeInList(card, VIEWPORT.top + 50);
    focusRingShows(card, true);
    const close = sheetContent().querySelector<HTMLButtonElement>(
      'button[aria-label="Fermer le détail"]',
    );
    if (close === null) throw new Error('no close button in the sheet');
    act(() => {
      close.focus();
    });
    expect(sheetContent().contains(document.activeElement)).toBe(true);

    await act(async () => {
      closeSheet(close);
      await nextFrame();
    });

    expect(card.getAttribute('aria-current')).toBeNull();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(card);
    expect(scroll).not.toHaveBeenCalled();
  });

  // why: Base UI closes the sheet on any Escape inside it; the one that
  // leaves the Street View panorama is already handled and must not.
  it('leaves the Street View panorama on Escape without closing the sheet', async () => {
    onScreen(40);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ panoId: 'CAoSLEFGMVFpcE1', heading: 212 }),
      ),
    );
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const shown: AddressCandidate = {
      ...FIRST,
      record: {
        ...FIRST.record,
        point: { latitude: 45.7578, longitude: 4.8515 },
      },
    };
    await renderClosable({
      match: match([shown, SECOND, THIRD]),
      shown,
      streetViewEnabled: true,
      streetViewEmbedKey: 'browser-embed-key',
    });
    // why: the opening sheet moves focus into itself a frame later.
    await act(async () => {
      await nextFrame();
    });
    const trigger = (): HTMLButtonElement | null =>
      sheetContent().querySelector<HTMLButtonElement>(
        'button[aria-label="Explorer le panorama Street View"]',
      );
    await act(async () => {
      trigger()?.click();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    const back = document.activeElement;
    expect(back?.textContent).toBe('Retour à la photo');
    expect(sheetContent().querySelector('iframe')).not.toBeNull();

    await act(async () => {
      back?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextFrame();
    });

    expect(
      resultsColumn().querySelector('button[aria-current="true"]'),
    ).not.toBeNull();
    expect(sheetContent().querySelector('iframe')).toBeNull();
    expect(document.activeElement).toBe(trigger());

    await act(async () => {
      trigger()?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextFrame();
    });

    expect(
      resultsColumn().querySelector('button[aria-current="true"]'),
    ).toBeNull();
  });
});

function sheetContent(): HTMLElement {
  const sheet = document.querySelector<HTMLElement>(
    '[data-slot="sheet-content"]',
  );
  if (sheet === null) throw new Error('no detail sheet');
  return sheet;
}

const READY_MAP = {
  kind: 'ready',
  overview: { latitude: 45.7597, longitude: 4.8422 },
} as const;

async function renderWithMap(
  props: Partial<ComponentProps<typeof ResultsWorkspace>> = {},
): Promise<void> {
  await render({ map: READY_MAP, accessToken: 'pk.test', ...props });
}

function mapViewSwitch(): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    `[role="group"][aria-label="${messages.Listing.mapViewLabel}"]`,
  );
}

function mapViewOption(label: string): HTMLButtonElement {
  const option = [...(mapViewSwitch()?.querySelectorAll('button') ?? [])].find(
    (button) => button.textContent === label,
  );
  if (option === undefined) throw new Error(`no "${label}" map view`);
  return option;
}

function pressedMapViews(): (string | null)[] {
  return [...(mapViewSwitch()?.querySelectorAll('button') ?? [])]
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.textContent);
}

function drawnMapView(): string | null | undefined {
  return container
    .querySelector('[role="application"]')
    ?.getAttribute('data-view');
}

// why: the toggle group moves focus between its options in a microtask; an
// async act() lets it land before the next key.
async function pressFocusedKey(key: string): Promise<void> {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  });
}

const MAP_VIEW = messages.Listing.mapViewMap;
const SATELLITE_VIEW = messages.Listing.mapViewSatellite;

describe('ResultsWorkspace map view switch', () => {
  it('offers the map and the satellite view, the map first and pressed', async () => {
    await renderWithMap();

    expect(
      [...(mapViewSwitch()?.querySelectorAll('button') ?? [])].map(
        (button) => button.textContent,
      ),
    ).toEqual([MAP_VIEW, SATELLITE_VIEW]);
    expect(pressedMapViews()).toEqual([MAP_VIEW]);
    expect(drawnMapView()).toBe('map');
  });

  it('draws the satellite view once it is picked', async () => {
    await renderWithMap();

    act(() => {
      mapViewOption(SATELLITE_VIEW).click();
    });
    expect(pressedMapViews()).toEqual([SATELLITE_VIEW]);
    expect(drawnMapView()).toBe('satellite');

    act(() => {
      mapViewOption(MAP_VIEW).click();
    });
    expect(pressedMapViews()).toEqual([MAP_VIEW]);
    expect(drawnMapView()).toBe('map');
  });

  it('keeps the view when its option is pressed again', async () => {
    await renderWithMap();

    act(() => {
      mapViewOption(MAP_VIEW).click();
    });
    expect(pressedMapViews()).toEqual([MAP_VIEW]);
    expect(drawnMapView()).toBe('map');
  });

  it('keeps the arrow keys and Escape from the detail shortcuts', async () => {
    const onSelect = vi.fn();
    const onCloseDetail = vi.fn();
    await renderWithMap({ onSelect, onCloseDetail });
    act(() => {
      mapViewOption(MAP_VIEW).focus();
    });

    await pressFocusedKey('ArrowRight');
    expect(document.activeElement).toBe(mapViewOption(SATELLITE_VIEW));
    await pressFocusedKey('ArrowLeft');
    expect(document.activeElement).toBe(mapViewOption(MAP_VIEW));
    await pressFocusedKey('Escape');
    expect(onSelect).not.toHaveBeenCalled();
    expect(onCloseDetail).not.toHaveBeenCalled();
  });

  it('is not drawn without a map', async () => {
    await render({ map: { kind: 'unavailable' } });

    expect(mapViewSwitch()).toBeNull();
  });

  // why: jsdom cannot lay out, so this pins the classes the placement depends
  // on: between lg and xl the detail floats over the right 424px of the map.
  it.each([
    ['past xl, with the detail docked', WIDE_SCREEN_REM, 'open', 'right-3'],
    [
      'between lg and xl, beside the floating detail',
      70,
      'open',
      'right-[424px]',
    ],
    ['between lg and xl, with the detail closed', 70, 'closed', 'right-3'],
    ['below lg', 40, 'open', 'right-3'],
  ] as const)('sits top right %s', async (_, widthRem, detailPreference, right) => {
    onScreen(widthRem);
    await renderWithMap({ detailPreference });

    const strip = mapViewSwitch()?.closest('.absolute');
    expect(strip?.classList).toContain('top-3');
    expect(strip?.classList).toContain(right);
  });

  it('shares one flex box with the address chip, so the two never overlap', async () => {
    await renderWithMap();

    const box = mapViewSwitch()?.parentElement;
    expect(box?.querySelector('[aria-live="polite"]')?.textContent).toBe(
      messages.Listing.mapNoTrustedPoint.replace(
        '{address}',
        FIRST.record.address,
      ),
    );
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
