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

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

function openedDialog(): HTMLElement {
  const opened = dialog();
  if (opened === null) throw new Error('no panorama dialog open');
  return opened;
}

// why: the dialog looks the panorama up once it opens, then shows the frame.
async function openPanorama(): Promise<void> {
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
  const element = openedDialog().querySelector('iframe');
  if (element === null) throw new Error('no panorama frame');
  return element;
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

  it('opens the panorama in a dialog inside the app with an embed key', async () => {
    render({ streetViewEmbedKey: EMBED_KEY });

    expect(container.querySelector('a')).toBeNull();
    expect(panoramaTrigger()?.textContent).toBe('');
    expect(container.textContent).toContain('Explorer le panorama');
    expect(dialog()).toBeNull();

    await openPanorama();

    const opened = openedDialog();
    expect(opened.textContent).toContain(`Street View · ${RECORD.address}`);
    expect(frame().getAttribute('title')).toBe(
      'Panorama Street View interactif',
    );
    expect(frame().hasAttribute('allowfullscreen')).toBe(true);
    expect(frame().getAttribute('loading')).toBe('lazy');
    expect(frame().getAttribute('referrerpolicy')).toBe(
      'strict-origin-when-cross-origin',
    );
    const outbound = opened.querySelector('a');
    expect(outbound?.getAttribute('href')).toBe(
      streetViewPanoramaUrl({ point: TRUSTED_POINT, panorama: PANORAMA }),
    );
    expect(outbound?.getAttribute('target')).toBe('_blank');
    expect(outbound?.textContent).toBe(
      'Ouvrir dans Google Maps (nouvel onglet)',
    );
  });

  // why: the screenshot is the panorama nearest the point, aimed at it; the
  // explorable view must continue from that image, not from another one.
  it("opens the embed on the photo's panorama, facing the point", async () => {
    render({ streetViewEmbedKey: EMBED_KEY });

    expect(lookup).not.toHaveBeenCalled();
    await openPanorama();

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

    await openPanorama();

    expect(frame().getAttribute('src')).toBe(
      streetViewEmbedUrl({
        point: TRUSTED_POINT,
        apiKey: EMBED_KEY,
        panorama: null,
      }),
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

    await openPanorama();
    expect(timeout).toHaveBeenCalledExactlyOnceWith(5000);
    expect(lookup.mock.calls[0]?.[1]?.signal).toBe(deadline.signal);
    expect(openedDialog().querySelector('iframe')).toBeNull();

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

  it('shows no frame while the panorama is being located', async () => {
    lookup.mockImplementation(() => new Promise<Response>(() => {}));
    render({ streetViewEmbedKey: EMBED_KEY });

    await openPanorama();

    expect(openedDialog().querySelector('iframe')).toBeNull();
    expect(
      openedDialog().querySelector('[data-slot="skeleton"]'),
    ).not.toBeNull();
  });

  it('closes the panorama dialog from its close button', async () => {
    render({ streetViewEmbedKey: EMBED_KEY });
    await openPanorama();
    const close = openedDialog().querySelector<HTMLButtonElement>(
      'button[aria-label="Fermer le panorama"]',
    );
    if (close === null) throw new Error('no close button in the dialog');

    act(() => {
      close.click();
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
