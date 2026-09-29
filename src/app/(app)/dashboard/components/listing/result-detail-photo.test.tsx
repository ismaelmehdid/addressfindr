// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aerialImageUrl } from '@/core/geo/aerial-image';
import {
  streetViewEmbedUrl,
  streetViewImagePath,
  streetViewPanoramaUrl,
} from '@/core/street-view/links';
import messages from '@/i18n/messages/fr.json';
import { ResultDetailPhoto } from './result-detail-photo';

// why: tells React that act() drives the updates, so it flushes them there.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const TRUSTED_POINT = { latitude: 45.7578, longitude: 4.8515 };
const STREET_VIEW_SRC = new URL(
  streetViewImagePath(TRUSTED_POINT),
  document.baseURI,
).href;
const AERIAL_SRC = aerialImageUrl(TRUSTED_POINT);
const RECORD = {
  address: '16 Rue Lavoisier 69003 Lyon',
  point: TRUSTED_POINT,
};
const EMBED_KEY = 'browser-embed-key';

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

function render(
  props: Partial<ComponentProps<typeof ResultDetailPhoto>>,
): void {
  act(() => {
    root.render(
      <NextIntlClientProvider
        locale="fr"
        messages={messages}
        timeZone="Europe/Paris"
      >
        <ResultDetailPhoto
          record={RECORD}
          streetViewEnabled
          streetViewEmbedKey=""
          {...props}
        />
      </NextIntlClientProvider>,
    );
  });
}

function panoramaTrigger(): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="Explorer le panorama Street View"]',
  );
}

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

function photo(): HTMLImageElement | null {
  return container.querySelector('img');
}

function failPhoto(): void {
  const image = photo();
  if (image === null) throw new Error('no photo to fail');
  act(() => {
    image.dispatchEvent(new Event('error'));
  });
}

describe('ResultDetailPhoto', () => {
  it('links the Street View photo to the panorama in a new tab without an embed key', () => {
    render({});

    const link = container.querySelector('a');
    expect(photo()?.src).toBe(STREET_VIEW_SRC);
    expect(link?.getAttribute('href')).toBe(
      streetViewPanoramaUrl(TRUSTED_POINT),
    );
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.textContent).toContain('Street View');
    expect(link?.textContent).toContain('Explorer le panorama');
  });

  // why: the panel clips an outer ring and the absolutely positioned photo
  // covers an inset outline, so the focus ring is drawn on a pseudo-element
  // stacked above the photo.
  it('draws the panorama link focus ring above the photo', () => {
    render({});

    const linkClasses = container.querySelector('a')?.className.split(/\s+/);
    expect(linkClasses).toEqual(
      expect.arrayContaining([
        'after:pointer-events-none',
        'after:absolute',
        'after:inset-0',
        'after:z-10',
        'focus-visible:after:ring-2',
        'focus-visible:after:ring-inset',
        'focus-visible:after:ring-charcoal',
      ]),
    );
  });

  it('opens the panorama in a dialog inside the app with an embed key', () => {
    render({ streetViewEmbedKey: EMBED_KEY });

    expect(container.querySelector('a')).toBeNull();
    const trigger = panoramaTrigger();
    expect(trigger?.textContent).toBe('');
    expect(container.textContent).toContain('Explorer le panorama');
    expect(dialog()).toBeNull();

    act(() => {
      trigger?.click();
    });

    const opened = dialog();
    expect(opened?.textContent).toContain(`Street View · ${RECORD.address}`);
    const frame = opened?.querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe(
      streetViewEmbedUrl(TRUSTED_POINT, EMBED_KEY),
    );
    expect(frame?.getAttribute('title')).toBe(
      'Panorama Street View interactif',
    );
    expect(frame?.hasAttribute('allowfullscreen')).toBe(true);
    expect(frame?.getAttribute('loading')).toBe('lazy');
    expect(frame?.getAttribute('referrerpolicy')).toBe(
      'strict-origin-when-cross-origin',
    );
    const outbound = opened?.querySelector('a');
    expect(outbound?.getAttribute('href')).toBe(
      streetViewPanoramaUrl(TRUSTED_POINT),
    );
    expect(outbound?.getAttribute('target')).toBe('_blank');
    expect(outbound?.textContent).toBe(
      'Ouvrir dans Google Maps (nouvel onglet)',
    );
  });

  it('closes the panorama dialog from its close button', () => {
    render({ streetViewEmbedKey: EMBED_KEY });
    act(() => {
      panoramaTrigger()?.click();
    });
    const close = dialog()?.querySelector<HTMLButtonElement>(
      'button[aria-label="Fermer le panorama"]',
    );

    act(() => {
      close?.click();
    });

    expect(dialog()).toBeNull();
  });

  it('never offers the panorama dialog on the orthophoto', () => {
    render({ streetViewEmbedKey: EMBED_KEY });

    failPhoto();

    expect(photo()?.src).toBe(AERIAL_SRC);
    expect(panoramaTrigger()).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it('falls back from Street View to the orthophoto, then to the placeholder', () => {
    render({});

    failPhoto();
    expect(photo()?.src).toBe(AERIAL_SRC);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('Satellite · IGN');

    failPhoto();
    expect(photo()).toBeNull();
    expect(container.textContent).toBe('Image indisponible');
  });

  it('starts on the orthophoto when Street View is disabled', () => {
    render({ streetViewEnabled: false });

    expect(photo()?.src).toBe(AERIAL_SRC);
    expect(container.querySelector('a')).toBeNull();
  });

  it('shows the placeholder without a trusted point', () => {
    render({ record: { ...RECORD, point: null } });

    expect(photo()).toBeNull();
    expect(container.textContent).toBe('Image indisponible');
  });
});
