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
const LEBONCOIN_FAVICON =
  'https://www.google.com/s2/favicons?domain=leboncoin.fr&sz=64';

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

// why: lucide names each icon twice (`lucide-building2 lucide-building-2`);
// the last class is the icon's file name.
function chips(): { text: string; icon: string }[] {
  return [...container.querySelectorAll('ul > li')].map((item) => {
    const icon = item.querySelector('svg');
    if (icon === null || icon !== item.firstElementChild?.firstElementChild) {
      throw new Error(`chip "${item.textContent}" has no leading icon`);
    }
    const name = [...icon.classList].findLast((className) =>
      className.startsWith('lucide-'),
    );
    return { text: item.textContent ?? '', icon: name ?? '' };
  });
}

function favicon(): HTMLImageElement | null {
  return container.querySelector('img');
}

function failFavicon(): void {
  const image = favicon();
  if (image === null) throw new Error('no favicon to fail');
  act(() => {
    image.dispatchEvent(new Event('error'));
  });
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

  it('shows the portal favicon, decorative, before the listing URL', () => {
    render(listing());
    const icon = favicon();

    expect(icon?.src).toBe(LEBONCOIN_FAVICON);
    expect(icon?.getAttribute('alt')).toBe('');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.parentElement?.firstElementChild).toBe(icon);
    expect(icon?.parentElement?.textContent).toContain(DISPLAY_URL);
  });

  it('falls back to a globe when the favicon does not load', () => {
    render(listing());
    failFavicon();
    const globe = container.querySelector('svg.lucide-globe');

    expect(favicon()).toBeNull();
    expect(globe?.getAttribute('aria-hidden')).toBe('true');
    expect(globe?.parentElement?.textContent).toContain(DISPLAY_URL);
  });

  it('tries the favicon again for a listing from another portal', () => {
    render(listing());
    failFavicon();
    render(
      listing({
        portal: 'seloger',
        canonicalUrl:
          'https://www.seloger.com/annonces/achat/appartement/lyon-3eme-69/123.htm',
      }),
    );

    expect(favicon()?.src).toBe(
      'https://www.google.com/s2/favicons?domain=seloger.com&sz=64',
    );
  });

  it('shows each listing detail as a chip, icon on the left, in order', () => {
    render(listing({ floor: 3 }));

    expect(chips()).toEqual([
      { text: 'Appartement', icon: 'lucide-building-2' },
      { text: '3 pièces', icon: 'lucide-door-open' },
      { text: '63 m²', icon: 'lucide-ruler' },
      { text: 'Étage 3', icon: 'lucide-layers' },
      { text: 'Construit en 1930', icon: 'lucide-calendar-days' },
      { text: 'Lyon (69003)', icon: 'lucide-map-pin' },
    ]);
  });

  it('puts a house in a chip with a house icon, and adds its land', () => {
    render(listing({ propertyType: 'house', landSurfaceM2: 450 }));

    expect(chips()).toEqual([
      { text: 'Maison', icon: 'lucide-house' },
      { text: '3 pièces', icon: 'lucide-door-open' },
      { text: '63 m²', icon: 'lucide-ruler' },
      { text: 'Terrain 450 m²', icon: 'lucide-land-plot' },
      { text: 'Construit en 1930', icon: 'lucide-calendar-days' },
      { text: 'Lyon (69003)', icon: 'lucide-map-pin' },
    ]);
  });

  it('hides every chip icon from screen readers', () => {
    render(listing({ floor: 3 }));
    const icons = [...container.querySelectorAll('li svg')];

    expect(icons).toHaveLength(6);
    for (const icon of icons) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });

  // why: unlike ADEME's default 0, the listing's own 0 is a real ground floor.
  it('reads the listing floor 0 as the ground floor', () => {
    render(listing({ floor: 0 }));

    expect(chips()).toContainEqual({
      text: 'Rez-de-chaussée',
      icon: 'lucide-layers',
    });
  });

  it('leaves the floor out when the listing does not give it', () => {
    render(listing({ floor: null }));

    expect(chips().map((chip) => chip.icon)).toEqual([
      'lucide-building-2',
      'lucide-door-open',
      'lucide-ruler',
      'lucide-calendar-days',
      'lucide-map-pin',
    ]);
  });

  it('shows no chip list when the listing gives no detail', () => {
    render(
      listing({
        propertyType: null,
        rooms: null,
        surfaceM2: null,
        yearBuilt: null,
        postalCode: null,
        city: null,
      }),
    );

    expect(container.querySelector('ul')).toBeNull();
    expect(
      container.querySelector('[data-slot="card-title"]')?.textContent,
    ).toBe('Annonce');
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
