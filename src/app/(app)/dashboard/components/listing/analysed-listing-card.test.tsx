// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_EXTRACTED_VALUES,
  EXTRACTED_FIELD_NAMES,
  type ExtractedListing,
} from '@/core/listing/types';
import messages from '@/i18n/messages/fr.json';
import { AnalysedListingCard } from './analysed-listing-card';

// why: tells React that act() drives the updates, so it flushes them there.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const LISTING_URL =
  'https://www.leboncoin.fr/ad/ventes_immobilieres/2345678901?utm_source=newsletter';
const DISPLAY_URL = 'leboncoin.fr/ad/ventes_immobilieres/2345678901';

function listing(
  over: Partial<ExtractedListing['fields']> = {},
): ExtractedListing {
  const sources = Object.fromEntries(
    EXTRACTED_FIELD_NAMES.map((name) => [name, 'hydration' as const]),
  ) as ExtractedListing['sources'];

  return {
    fields: {
      ...EMPTY_EXTRACTED_VALUES,
      portal: 'leboncoin',
      canonicalUrl: LISTING_URL,
      pin: null,
      propertyType: 'apartment',
      rooms: 3,
      surfaceM2: 63,
      yearBuilt: 1930,
      postalCode: '69003',
      city: 'Lyon',
      ...over,
    },
    sources,
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

function render(value: ExtractedListing): void {
  act(() => {
    root.render(
      <NextIntlClientProvider
        locale="fr"
        messages={messages}
        timeZone="Europe/Paris"
      >
        <AnalysedListingCard listing={value} />
      </NextIntlClientProvider>,
    );
  });
}

function onlyLink(): HTMLAnchorElement {
  const links = container.querySelectorAll('a');
  const [link] = links;
  if (links.length !== 1 || link === undefined) {
    throw new Error(`expected one link, found ${links.length}`);
  }
  return link;
}

describe('AnalysedListingCard', () => {
  it('is one link to the listing, opened in a new tab', () => {
    render(listing());
    const link = onlyLink();

    expect(link.href).toBe(LISTING_URL);
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.querySelector('[data-slot="card"]')).not.toBeNull();
    expect(link.querySelector('.sr-only')?.textContent).toBe(
      ' (nouvel onglet)',
    );
  });

  it('names and shows the listing URL without its tracking parameters', () => {
    render(listing());
    const link = onlyLink();

    expect(link.title).toBe(`Ouvrir l’annonce d’origine : ${DISPLAY_URL}`);
    expect(link.textContent).toContain(DISPLAY_URL);
    expect(link.textContent).not.toContain('utm_source');
  });

  it('recaps the listing in type, surface, floor, year, place order', () => {
    render(listing({ floor: 3 }));

    expect(onlyLink().textContent).toContain(
      'Appartement · 63 m² · Étage 3 · Construit en 1930 · Lyon (69003)',
    );
  });

  // why: unlike ADEME's default 0, the listing's own 0 is a real ground floor.
  it('reads the listing floor 0 as the ground floor', () => {
    render(listing({ floor: 0 }));

    expect(onlyLink().textContent).toContain(
      'Appartement · 63 m² · Rez-de-chaussée · Construit en 1930',
    );
  });

  it('leaves the floor out when the listing does not give it', () => {
    render(listing({ floor: null }));

    expect(onlyLink().textContent).toContain(
      'Appartement · 63 m² · Construit en 1930',
    );
  });

  // why: the primitive's small-card title size outranks a plain text size.
  it('sets the title at 15 px in the small card', () => {
    render(listing());
    const titleSizes = (
      container.querySelector('[data-slot="card-title"]')?.className ?? ''
    )
      .split(/\s+/)
      .filter((name) => /(^|:)text-(\[|xs$|sm$|base$|lg$)/.test(name));

    expect(titleSizes).toEqual([
      'text-[15px]',
      'group-data-[size=sm]/card:text-[15px]',
    ]);
  });
});
