// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aerialImageUrl } from '@/core/geo/aerial-image';
import {
  streetViewEmbedUrl,
  streetViewImagePath,
  streetViewPanoramaLookupPath,
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
const PANORAMA = { panoId: 'CAoSLEFGMVFpcE1', heading: 212 };

let container: HTMLDivElement;
let root: Root;
let lookup: ReturnType<typeof vi.fn<typeof fetch>>;

function answerLookupWith(response: () => Response): void {
  lookup.mockImplementation(async () => response());
}

beforeEach(() => {
  lookup = vi.fn<typeof fetch>();
  answerLookupWith(() => Response.json(PANORAMA));
  vi.stubGlobal('fetch', lookup);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

// why: exploring looks the panorama up first, then shows the frame in place.
async function explore(): Promise<void> {
  const trigger = panoramaTrigger();
  if (trigger === null) throw new Error('no panorama trigger');
  await act(async () => {
    trigger.click();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

function frame(): HTMLIFrameElement {
  const element = container.querySelector('iframe');
  if (element === null) throw new Error('no panorama frame');
  return element;
}

function backButton(): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === 'Retour à la photo',
  );
  if (button === undefined) throw new Error('no back button');
  return button;
}

function openInMaps(): HTMLAnchorElement | null {
  return container.querySelector('a');
}

function pressEscape(target: Element): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
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
    expect(panoramaTrigger()).toBeNull();
    expect(link?.getAttribute('href')).toBe(
      streetViewPanoramaUrl({ point: TRUSTED_POINT, panorama: null }),
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

  it('swaps the photo for the interactive panorama in place with an embed key', async () => {
    render({ streetViewEmbedKey: EMBED_KEY });

    expect(openInMaps()).toBeNull();
    expect(panoramaTrigger()?.textContent).toBe('');
    expect(container.textContent).toContain('Explorer le panorama');
    expect(container.querySelector('iframe')).toBeNull();

    await explore();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(
      container.querySelector('[role="group"]')?.getAttribute('aria-label'),
    ).toBe(`Street View · ${RECORD.address}`);
    expect(photo()).toBeNull();
    expect(panoramaTrigger()).toBeNull();
    expect(frame().getAttribute('title')).toBe(
      'Panorama Street View interactif',
    );
    expect(frame().hasAttribute('allowfullscreen')).toBe(true);
    expect(frame().getAttribute('loading')).toBe('lazy');
    expect(frame().getAttribute('referrerpolicy')).toBe(
      'strict-origin-when-cross-origin',
    );
    expect(document.activeElement).toBe(backButton());
    expect(openInMaps()?.getAttribute('href')).toBe(
      streetViewPanoramaUrl({ point: TRUSTED_POINT, panorama: PANORAMA }),
    );
    expect(openInMaps()?.getAttribute('target')).toBe('_blank');
    expect(openInMaps()?.textContent).toBe(
      'Ouvrir dans Google Maps (nouvel onglet)',
    );
  });

  // why: the screenshot is the panorama nearest the point, aimed at it; the
  // explorable view must continue from that image, not from another one.
  it("opens the embed on the photo's panorama, facing the point", async () => {
    render({ streetViewEmbedKey: EMBED_KEY });

    expect(lookup).not.toHaveBeenCalled();
    await explore();

    expect(lookup).toHaveBeenCalledOnce();
    expect(lookup.mock.calls[0]?.[0]).toBe(
      streetViewPanoramaLookupPath(TRUSTED_POINT),
    );
    expect(frame().getAttribute('src')).toBe(
      streetViewEmbedUrl({
        point: TRUSTED_POINT,
        apiKey: EMBED_KEY,
        panorama: PANORAMA,
      }),
    );
  });

  it.each<[string, () => Response]>([
    ['finds no panorama', () => Response.json({}, { status: 404 })],
    ['answers something else', () => Response.json({ panoId: '', heading: 0 })],
    [
      'fails',
      () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])('falls back to the outdoor panorama nearest the point when the lookup %s', async (_, response) => {
    answerLookupWith(response);
    render({ streetViewEmbedKey: EMBED_KEY });

    await explore();

    expect(frame().getAttribute('src')).toBe(
      streetViewEmbedUrl({
        point: TRUSTED_POINT,
        apiKey: EMBED_KEY,
        panorama: null,
      }),
    );
    expect(openInMaps()?.getAttribute('href')).toBe(
      streetViewPanoramaUrl({ point: TRUSTED_POINT, panorama: null }),
    );
  });

  // why: the lookup route can hang for its whole maxDuration, or for good on
  // a stalled connection; past 5 s the frame opens on the outdoor search.
  it('falls back to the outdoor panorama nearest the point when the lookup times out after 5 s', async () => {
    const deadline = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(deadline.signal);
    lookup.mockImplementation(
      (_, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason);
          });
        }),
    );
    render({ streetViewEmbedKey: EMBED_KEY });

    await explore();
    expect(timeout).toHaveBeenCalledExactlyOnceWith(5000);
    expect(lookup.mock.calls[0]?.[1]?.signal).toBe(deadline.signal);
    expect(container.querySelector('iframe')).toBeNull();

    await act(async () => {
      deadline.abort(new DOMException('timed out', 'TimeoutError'));
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    expect(frame().getAttribute('src')).toBe(
      streetViewEmbedUrl({
        point: TRUSTED_POINT,
        apiKey: EMBED_KEY,
        panorama: null,
      }),
    );
  });

  it('shows a placeholder and only the way back while the panorama is being located', async () => {
    lookup.mockImplementation(() => new Promise<Response>(() => {}));
    render({ streetViewEmbedKey: EMBED_KEY });

    await explore();

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    expect(photo()).toBeNull();
    expect(openInMaps()).toBeNull();
    expect(document.activeElement).toBe(backButton());
  });

  it('brings the photo back from its back button, focus on the photo', async () => {
    render({ streetViewEmbedKey: EMBED_KEY });
    await explore();

    act(() => {
      backButton().click();
    });

    expect(container.querySelector('iframe')).toBeNull();
    expect(photo()?.src).toBe(STREET_VIEW_SRC);
    expect(document.activeElement).toBe(panoramaTrigger());
  });

  it('brings the photo back on Escape, marking the key handled', async () => {
    render({ streetViewEmbedKey: EMBED_KEY });
    await explore();

    const keydown = pressEscape(backButton());

    expect(keydown.defaultPrevented).toBe(true);
    expect(container.querySelector('iframe')).toBeNull();
    expect(photo()?.src).toBe(STREET_VIEW_SRC);
    expect(document.activeElement).toBe(panoramaTrigger());
  });

  it('leaves Escape alone while the photo is shown', () => {
    render({ streetViewEmbedKey: EMBED_KEY });
    const trigger = panoramaTrigger();
    if (trigger === null) throw new Error('no panorama trigger');

    expect(pressEscape(trigger).defaultPrevented).toBe(false);
  });

  it('explores the same panorama again without a second lookup', async () => {
    render({ streetViewEmbedKey: EMBED_KEY });
    await explore();
    act(() => {
      backButton().click();
    });

    await explore();

    expect(lookup).toHaveBeenCalledOnce();
    expect(frame().getAttribute('src')).toBe(
      streetViewEmbedUrl({
        point: TRUSTED_POINT,
        apiKey: EMBED_KEY,
        panorama: PANORAMA,
      }),
    );
    expect(document.activeElement).toBe(backButton());
  });

  it('never offers the panorama on the orthophoto', () => {
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
