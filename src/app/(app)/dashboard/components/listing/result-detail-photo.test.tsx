// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aerialImageUrl } from '@/core/geo/aerial-image';
import {
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
        <ResultDetailPhoto record={RECORD} streetViewEnabled {...props} />
      </NextIntlClientProvider>,
    );
  });
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
  it('links the Street View photo to the panorama in a new tab', () => {
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
