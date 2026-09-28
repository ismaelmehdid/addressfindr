// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  dvfSalesUrl,
  georisquesReportUrl,
  googleMapsUrl,
  villedereveCommuneUrl,
} from '@/core/geo/outbound-links';
import messages from '@/i18n/messages/fr.json';
import { VerifyElsewhere } from './verify-elsewhere';

// why: tells React that act() drives the updates, so it flushes them there.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const TRUSTED_POINT = { latitude: 45.7578, longitude: 4.8515 };

const RECORD: ComponentProps<typeof VerifyElsewhere>['record'] = {
  point: TRUSTED_POINT,
  inseeCode: '69383',
  address: '16 Rue Lavoisier 69003 Lyon',
  city: 'Lyon',
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

function render(record: ComponentProps<typeof VerifyElsewhere>['record']) {
  act(() => {
    root.render(
      <NextIntlClientProvider
        locale="fr"
        messages={messages}
        timeZone="Europe/Paris"
      >
        <VerifyElsewhere record={record} />
      </NextIntlClientProvider>,
    );
  });
}

function links(): HTMLAnchorElement[] {
  return [...container.querySelectorAll('a')];
}

describe('VerifyElsewhere', () => {
  it('renders nothing without a trusted point', () => {
    render({ ...RECORD, point: null });

    expect(container.innerHTML).toBe('');
  });

  it('links Google Maps, Géorisques, DVF and Villederêve in a new tab', () => {
    render(RECORD);

    expect(container.querySelector('h3')?.textContent).toBe(
      'Vérifier ailleurs',
    );
    expect(links().map((link) => link.getAttribute('href'))).toEqual([
      googleMapsUrl(TRUSTED_POINT),
      georisquesReportUrl({ ...RECORD, point: TRUSTED_POINT }),
      dvfSalesUrl({ point: TRUSTED_POINT, inseeCode: '69383' }),
      villedereveCommuneUrl('69383'),
    ]);
    for (const link of links()) {
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener noreferrer');
    }
  });

  it('names each destination and what it is for', () => {
    render(RECORD);

    expect(links().map((link) => link.textContent)).toEqual([
      'Google MapsRue et alentours',
      'GéorisquesRisques du terrain',
      'DVFPrix des ventes',
      'VillederêveVie de la commune',
    ]);
  });

  it('gives each destination its own coloured icon square', () => {
    render(RECORD);

    expect(
      links().map(
        (link) =>
          link.querySelector<HTMLElement>('span[aria-hidden]')?.style
            .backgroundColor,
      ),
    ).toEqual([
      'rgb(79, 109, 153)',
      'rgb(176, 110, 78)',
      'rgb(58, 116, 128)',
      'rgb(116, 98, 155)',
    ]);
  });

  // why: the outline button's own h-7 and whitespace-nowrap come later in the
  // stylesheet, so they must be merged away for a two-line tile to fit.
  it('lets a tile grow and wrap instead of keeping the button height', () => {
    render(RECORD);

    for (const link of links()) {
      expect(link.classList).toContain('whitespace-normal');
      expect(link.classList).not.toContain('whitespace-nowrap');
      expect(link.classList).toContain('h-auto');
      expect(link.classList).not.toContain('h-7');
    }
  });

  it('keeps only the map link for a malformed commune code', () => {
    render({ ...RECORD, inseeCode: '6938' });

    expect(links().map((link) => link.getAttribute('href'))).toEqual([
      googleMapsUrl(TRUSTED_POINT),
    ]);
  });
});
