// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressCandidate, DpeRecord } from '@/core/ademe/types';
import { aerialImageUrl } from '@/core/geo/aerial-image';
import { streetViewImagePath } from '@/core/street-view/links';
import messages from '@/i18n/messages/fr.json';
import { AddressCandidateList } from './address-candidate-list';

// why: tells React that act() drives the updates, so it flushes them there.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// why: jsdom does not implement scrollIntoView, which a card calls when the
// selection arrives on it.
const scrollIntoView = vi.fn();
HTMLElement.prototype.scrollIntoView = scrollIntoView;

const TRUSTED_POINT = { latitude: 45.7578, longitude: 4.8515 };
const STREET_VIEW_SRC = new URL(
  streetViewImagePath(TRUSTED_POINT),
  document.baseURI,
).href;
const AERIAL_SRC = aerialImageUrl(TRUSTED_POINT);

function candidate(
  record: Partial<DpeRecord>,
  confidence = 0.82,
): AddressCandidate {
  return {
    record: {
      dpeNumber: '2369E0000001A',
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
      point: TRUSTED_POINT,
      ...record,
    },
    confidence,
    matched: [],
    diverged: [],
    supportingRecords: 1,
  };
}

const TOP = candidate({});
const SECOND = candidate(
  {
    dpeNumber: '2369E0000002B',
    address: '70 Rue de l’Abondance 69003 Lyon',
    streetNumber: '70',
    street: 'Rue de l’Abondance',
  },
  0.61,
);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  scrollIntoView.mockClear();
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

function render(
  props: Partial<ComponentProps<typeof AddressCandidateList>>,
): void {
  act(() => {
    root.render(
      <NextIntlClientProvider
        locale="fr"
        messages={messages}
        timeZone="Europe/Paris"
      >
        <AddressCandidateList
          candidates={[TOP]}
          selectedDpeNumber={null}
          onSelect={() => {}}
          streetViewEnabled
          {...props}
        />
      </NextIntlClientProvider>,
    );
  });
}

function cards(): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-slot="card"]')];
}

function onlyCard(): HTMLElement {
  const [card] = cards();
  if (card === undefined) throw new Error('no card rendered');
  return card;
}

function photo(card: HTMLElement): HTMLImageElement | null {
  return card.querySelector('img');
}

function failPhoto(card: HTMLElement): void {
  const image = photo(card);
  if (image === null) throw new Error('no photo to fail');
  act(() => {
    image.dispatchEvent(new Event('error'));
  });
}

// why: rank 1 then the 82/100 pill, before the street line.
const RANK_THEN_SCORE = /^1.*82\/100/;

function headerText(card: HTMLElement): string | undefined {
  return card.querySelector('[data-slot="card-header"]')?.textContent;
}

function classes(element: Element | null): string[] {
  return element?.className.split(/\s+/) ?? [];
}

describe('AddressCandidateList photo', () => {
  it('falls back from Street View to the orthophoto, then to the placeholder', () => {
    render({});
    const card = onlyCard();

    expect(photo(card)?.src).toBe(STREET_VIEW_SRC);
    expect(card.textContent).toContain('Street View');

    failPhoto(card);
    expect(photo(card)?.src).toBe(AERIAL_SRC);
    expect(card.textContent).toContain('Satellite · IGN');

    failPhoto(card);
    expect(photo(card)).toBeNull();
    expect(headerText(card)).toMatch(RANK_THEN_SCORE);
  });

  it('starts on the orthophoto when Street View is disabled', () => {
    render({ streetViewEnabled: false });

    expect(photo(onlyCard())?.src).toBe(AERIAL_SRC);
  });

  it('shows no photo without a trusted point and puts rank and score in the header', () => {
    render({ candidates: [candidate({ point: null })] });
    const card = onlyCard();

    expect(photo(card)).toBeNull();
    expect(headerText(card)).toMatch(RANK_THEN_SCORE);
    expect(card.textContent).toContain('Pas de position fiable sur la carte');
  });
});

describe('AddressCandidateList card', () => {
  // why: the primitive's data-[size=sm] variants outrank plain classes, and
  // tailwind-merge only drops a variant for the same variant.
  it('keeps no small-card padding above the photo', () => {
    render({});

    const smallCardSpacing = classes(onlyCard()).filter((name) =>
      /^data-\[size=sm\]:(py|gap)-/.test(name),
    );
    expect(smallCardSpacing.sort()).toEqual([
      'data-[size=sm]:gap-0',
      'data-[size=sm]:py-0',
    ]);
  });

  it('sets the street line at 15 px in the small card', () => {
    render({});

    const titleSizes = classes(
      onlyCard().querySelector('[data-slot="card-title"]'),
    ).filter((name) => /(^|:)text-(\[|xs$|sm$|base$|lg$)/.test(name));
    expect(titleSizes).toEqual([
      'text-[15px]',
      'group-data-[size=sm]/card:text-[15px]',
    ]);
  });

  it('keeps the top card call to action inside its single button', () => {
    const onSelect = vi.fn();
    render({ candidates: [TOP, SECOND], onSelect });
    const [top, second] = cards();
    const topButtons = top?.querySelectorAll('button') ?? [];

    expect(topButtons).toHaveLength(1);
    expect(top?.querySelectorAll('a, button button')).toHaveLength(0);
    expect(topButtons[0]?.textContent).toContain('Vérifier cette adresse →');
    expect(second?.textContent).not.toContain('Vérifier cette adresse');

    act(() => {
      topButtons[0]?.click();
    });
    expect(onSelect).toHaveBeenCalledWith(TOP.record.dpeNumber);
  });

  it('reads the score band inside the card button', () => {
    render({});
    const band = onlyCard().querySelector('button .sr-only');

    expect(band?.textContent).toMatch(/^Correspondance /);
    expect(band?.closest('[aria-hidden="true"], [hidden]')).toBeNull();
  });

  it('keeps a dimmed card in the tab order', () => {
    render({
      candidates: [TOP, SECOND],
      selectedDpeNumber: TOP.record.dpeNumber,
    });
    const [, dimmed] = cards();
    const button = dimmed?.querySelector('button');

    expect(classes(dimmed ?? null)).toEqual(
      expect.arrayContaining([
        'lg:opacity-60',
        'lg:hover:opacity-100',
        'lg:has-focus-visible:opacity-100',
      ]),
    );
    expect(button?.tabIndex).toBe(0);
    expect(button?.closest('[inert], [aria-hidden="true"]')).toBeNull();
    act(() => {
      button?.focus();
    });
    expect(document.activeElement).toBe(button);
  });

  // why: the Card clips its content (overflow-hidden, no padding), which hides
  // any ring drawn on the button; an outline on the Card itself sits outside
  // that clip and above the positioned photo.
  it('outlines the whole card while its button has keyboard focus', () => {
    render({});
    const card = onlyCard();

    expect(classes(card)).toEqual(
      expect.arrayContaining([
        'has-focus-visible:outline-2',
        'has-focus-visible:outline-offset-2',
        'has-focus-visible:outline-charcoal',
      ]),
    );
    expect(
      classes(card.querySelector('button')).filter((name) =>
        name.startsWith('focus-visible:'),
      ),
    ).toEqual([]);
  });

  it('rings the selected card and dims the others only while one is selected', () => {
    render({ candidates: [TOP, SECOND], selectedDpeNumber: null });
    for (const card of cards()) {
      expect(classes(card)).not.toContain('ring-(--score)');
      expect(classes(card)).not.toContain('lg:opacity-60');
    }

    render({
      candidates: [TOP, SECOND],
      selectedDpeNumber: TOP.record.dpeNumber,
    });
    const [top, second] = cards();
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(classes(top ?? null)).toEqual(
      expect.arrayContaining(['ring-(--score)', 'bg-(--score-tint)']),
    );
    expect(classes(top ?? null)).not.toContain('lg:opacity-60');
    expect(top?.querySelector('button')?.getAttribute('aria-current')).toBe(
      'true',
    );
    expect(classes(second ?? null)).toContain('lg:opacity-60');
    expect(classes(second ?? null)).not.toContain('ring-(--score)');
  });
});

describe('AddressCandidateList score colour', () => {
  it('writes the rank and the score in whichever of white or ink contrasts more', () => {
    render({
      candidates: [
        candidate({}, 1),
        candidate({ dpeNumber: '2369E0000002B' }, 0.74),
      ],
    });
    const [darkGreen, lightYellow] = cards();

    expect(darkGreen?.style.getPropertyValue('--score-ink')).toBe('#ffffff');
    expect(lightYellow?.style.getPropertyValue('--score-ink')).toBe('#2d2f2a');
    for (const card of cards()) {
      const onScore = [...card.querySelectorAll('[data-slot="badge"]')].filter(
        (badge) => classes(badge).includes('bg-(--score)'),
      );
      expect(onScore).toHaveLength(2);
      for (const badge of onScore) {
        expect(classes(badge)).toContain('text-(--score-ink)');
        expect(classes(badge)).not.toContain('text-white');
      }
    }
  });
});
