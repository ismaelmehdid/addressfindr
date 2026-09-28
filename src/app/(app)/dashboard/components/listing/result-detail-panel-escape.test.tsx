// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, onTestFinished, vi } from 'vitest';
import type { AddressCandidate } from '@/core/ademe/types';
import messages from '@/i18n/messages/fr.json';
import { ResultDetailPanel } from './result-detail-panel';
import { useDetailShortcuts } from './use-detail-shortcuts';

// why: tells React that act() drives the updates, so it flushes them there.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CANDIDATE: AddressCandidate = {
  record: {
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
    landSurfaceM2: null,
    floor: 3,
    buildingComplement: null,
    establishedOn: '2022-04-14',
    visitedOn: null,
    annualEnergyCostEur: null,
    geocodingScore: 0.9,
    point: null,
  },
  confidence: 0.82,
  matched: [],
  diverged: [],
  supportingRecords: 1,
};

function PanelWithShortcuts({ onClose }: { onClose: () => void }) {
  useDetailShortcuts({
    enabled: true,
    onClose,
    onPrevious: null,
    onNext: null,
  });
  return (
    <ResultDetailPanel
      candidate={CANDIDATE}
      rank={1}
      total={1}
      onPrevious={null}
      onNext={null}
      onClose={onClose}
      streetViewEnabled={false}
      listing={{
        propertyType: 'apartment',
        surfaceM2: 63,
        floor: 3,
        yearBuilt: 1930,
        heatingEnergy: 'gas',
        dpeDate: '2022-04-14',
      }}
    />
  );
}

async function pressEscape(target: HTMLElement): Promise<void> {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

// why: Next.js mounts React on `document`, where the tooltip's stopPropagation
// cannot stop the shortcut's listener. It must be the file's only root: React
// skips listening on a document an earlier root already marked.
it('closes the copy tooltip on the first Escape and the detail on the second', async () => {
  const onClose = vi.fn();
  const root = createRoot(document);
  onTestFinished(() => {
    act(() => {
      root.unmount();
    });
  });
  await act(async () => {
    root.render(
      <html lang="fr">
        <body>
          <NextIntlClientProvider
            locale="fr"
            messages={messages}
            timeZone="Europe/Paris"
          >
            <PanelWithShortcuts onClose={onClose} />
          </NextIntlClientProvider>
        </body>
      </html>,
    );
  });
  const copyButton = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Copier l’adresse"]',
  );
  if (copyButton === null) throw new Error('no copy button');
  const tooltip = () => document.querySelector('[data-slot="tooltip-content"]');

  await act(async () => {
    copyButton.focus();
  });
  expect(tooltip()?.textContent).toBe('Copier l’adresse');

  await pressEscape(copyButton);
  expect(tooltip()).toBeNull();
  expect(document.activeElement).toBe(copyButton);
  expect(onClose).not.toHaveBeenCalled();

  await pressEscape(copyButton);
  expect(onClose).toHaveBeenCalledOnce();
});
