// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest';
import { scoreColour } from '@/core/ademe/score-scale';
import type { AddressCandidate, DpeRecord } from '@/core/ademe/types';
import messages from '@/i18n/messages/fr.json';
import { ResultDetailPanel } from './result-detail-panel';

// why: tells React that act() drives the updates, so it flushes them there.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const RECORD: DpeRecord = {
  dpeNumber: '2269E0000001A',
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
  gesClass: 'E',
  dpeKwhM2Year: 210,
  gesKgCo2M2Year: 40,
  heatingEnergy: 'gas',
  yearBuilt: 1930,
  buildingFloors: null,
  landSurfaceM2: 250,
  floor: 3,
  buildingComplement: null,
  establishedOn: '2022-04-14',
  visitedOn: null,
  annualEnergyCostEur: null,
  geocodingScore: 0.9,
  point: null,
};

const LISTING: ComponentProps<typeof ResultDetailPanel>['listing'] = {
  propertyType: 'apartment',
  surfaceM2: 63.5,
  floor: 3,
  yearBuilt: 1931,
  heatingEnergy: 'gas',
  dpeDate: '2022-04-14',
};

function candidate(record: Partial<DpeRecord>): AddressCandidate {
  return {
    record: { ...RECORD, ...record },
    confidence: 0.82,
    matched: [],
    diverged: [],
    supportingRecords: 1,
  };
}

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
  props: Partial<ComponentProps<typeof ResultDetailPanel>>,
): Promise<void> {
  await act(async () => {
    root.render(
      <NextIntlClientProvider
        locale="fr"
        messages={messages}
        timeZone="Europe/Paris"
      >
        <ResultDetailPanel
          candidate={candidate({})}
          rank={2}
          total={3}
          onPrevious={() => {}}
          onNext={() => {}}
          onClose={() => {}}
          streetViewEnabled={false}
          listing={LISTING}
          {...props}
        />
      </NextIntlClientProvider>,
    );
  });
}

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  onTestFinished(() => {
    if (descriptor === undefined) {
      Reflect.deleteProperty(navigator, 'clipboard');
    } else {
      Object.defineProperty(navigator, 'clipboard', descriptor);
    }
  });
}

function copyButton(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Copier l’adresse"]',
  );
  if (button === null) throw new Error('no copy button');
  return button;
}

function copyStatus(): HTMLElement {
  const status = container.querySelector<HTMLElement>('[role="status"]');
  if (status === null) throw new Error('no copy status');
  return status;
}

async function clickCopy(): Promise<void> {
  await act(async () => {
    copyButton().click();
  });
}

function badge(label: 'DPE' | 'GES'): HTMLElement {
  const found = [
    ...container.querySelectorAll<HTMLElement>('[data-slot="badge"]'),
  ].find((element) => element.textContent?.startsWith(label));
  if (found === undefined) throw new Error(`no ${label} badge`);
  return found;
}

function letterSquare(label: 'DPE' | 'GES'): HTMLElement {
  const square = badge(label).querySelector<HTMLElement>('span');
  if (square === null) throw new Error(`no ${label} letter square`);
  return square;
}

type Tile = { label: string; value: string; agrees: boolean };

function tiles(): Tile[] {
  return [...container.querySelectorAll('[data-slot="card"]')].map((card) => {
    const lines = [...card.querySelectorAll('p')].map(
      (line) => line.textContent,
    );
    return {
      label: lines[0] ?? '',
      value: lines[1] ?? '',
      agrees: lines[2] === 'Conforme à l’annonce',
    };
  });
}

describe('ResultDetailPanel score line', () => {
  it('shows the rank and the score in the score colour', async () => {
    await render({});

    const scored = container.querySelector<HTMLElement>('[style*="--score:"]');
    expect(scored?.style.getPropertyValue('--score')).toBe(scoreColour(82));
    const scoreLine = scored?.firstElementChild;
    expect(scoreLine?.textContent).toContain('82/100');
    expect(scoreLine?.textContent).toContain('score de correspondance');
    expect(scoreLine?.querySelector('[data-slot="badge"]')?.textContent).toBe(
      '2',
    );
    expect(scoreLine?.querySelector('.text-\\(--score\\)')?.textContent).toBe(
      '82/100',
    );
  });

  it('names the score band for screen readers', async () => {
    await render({});

    expect(container.querySelector('.sr-only')?.textContent).toBe(
      'Correspondance probable',
    );
  });
});

describe('ResultDetailPanel address', () => {
  it('makes the street line the heading, above the postal code and city', async () => {
    await render({});

    const headings = container.querySelectorAll('h2');
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe('16 Rue Lavoisier');
    expect(headings[0]?.nextElementSibling?.textContent).toBe('69003 Lyon');
  });

  it('keeps "Résultat {n}" as the header title', async () => {
    await render({});

    expect(container.querySelector('p')?.textContent).toBe('Résultat 2');
  });

  it('copies the street line with the postal code and city', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    await render({});

    await clickCopy();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      '16 Rue Lavoisier, 69003 Lyon',
    );
  });

  it('shows a check and "Adresse copiée" for two seconds after a copy', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    stubClipboard(() => Promise.resolve());
    await render({});
    expect(copyStatus().textContent).toBe('');
    expect(copyButton().querySelector('.lucide-copy')).not.toBeNull();

    await clickCopy();

    expect(copyStatus().textContent).toBe('Adresse copiée');
    expect(copyButton().querySelector('.lucide-check')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(copyStatus().textContent).toBe('Adresse copiée');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(copyStatus().textContent).toBe('');
    expect(copyButton().querySelector('.lucide-copy')).not.toBeNull();
  });

  it('says so in the destructive colour when the copy fails', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    await render({});

    await clickCopy();

    expect(copyStatus().textContent).toBe('Impossible de copier l’adresse');
    expect(copyStatus().classList).toContain('text-destructive');
    expect(copyButton().querySelector('.lucide-check')).toBeNull();
  });
});

describe('ResultDetailPanel energy labels', () => {
  it('puts each letter in a square of its official colour, never check-marked', async () => {
    await render({});

    expect(badge('DPE').textContent).toBe('DPE D');
    expect(letterSquare('DPE').textContent).toBe('D');
    expect(letterSquare('DPE').style.backgroundColor).toBe('rgb(244, 231, 15)');
    expect(letterSquare('DPE').classList).toContain('text-ink');

    expect(badge('GES').textContent).toBe('GES E');
    expect(letterSquare('GES').style.backgroundColor).toBe('rgb(166, 99, 233)');
    expect(letterSquare('GES').classList).toContain('text-white');

    expect(badge('DPE').querySelector('svg')).toBeNull();
    expect(badge('GES').querySelector('svg')).toBeNull();
  });
});

describe('ResultDetailPanel fact tiles', () => {
  it('lists the facts in order, marking only those that match the listing', async () => {
    await render({});

    expect(tiles()).toEqual([
      { label: 'Type de bien', value: 'Appartement', agrees: true },
      { label: 'Surface', value: '63 m²', agrees: true },
      { label: 'Étage estimé', value: '3e étage', agrees: true },
      { label: 'Terrain cadastral', value: '250 m²', agrees: false },
      { label: 'Année de construction', value: '1930', agrees: false },
      { label: 'Chauffage', value: 'Gaz', agrees: true },
      { label: 'Date du DPE', value: '14 avril 2022', agrees: true },
    ]);
  });

  it('never shows ADEME’s default floor 0', async () => {
    await render({ candidate: candidate({ floor: 0 }), listing: LISTING });

    expect(tiles().map((tile) => tile.label)).not.toContain('Étage estimé');
    expect(container.textContent).not.toContain('Rez-de-chaussée');
  });

  it('drops the tiles whose value is unknown', async () => {
    await render({
      candidate: candidate({
        landSurfaceM2: null,
        heatingEnergy: null,
        establishedOn: null,
      }),
    });

    expect(tiles().map((tile) => tile.label)).toEqual([
      'Type de bien',
      'Surface',
      'Étage estimé',
      'Année de construction',
    ]);
  });
});

describe('ResultDetailPanel verify elsewhere', () => {
  it('is absent without a trusted point', async () => {
    await render({});

    expect(container.textContent).not.toContain('Vérifier ailleurs');
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('ends the body with the outbound links around a trusted point', async () => {
    await render({
      candidate: candidate({
        point: { latitude: 45.7578, longitude: 4.8515 },
      }),
    });

    const section = container.querySelector('section');
    expect(section?.querySelector('h3')?.textContent).toBe('Vérifier ailleurs');
    expect(section?.parentElement?.lastElementChild).toBe(section);
    expect(section?.querySelectorAll('a')).toHaveLength(4);
  });
});
