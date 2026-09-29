// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, onTestFinished, vi } from 'vitest';
import messages from '@/i18n/messages/fr.json';
import { ResultDetailPhoto } from './result-detail-photo';
import { useDetailShortcuts } from './use-detail-shortcuts';

// why: tells React that act() drives the updates, so it flushes them there.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Shortcuts = {
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

function PhotoWithShortcuts(shortcuts: Shortcuts) {
  useDetailShortcuts({ enabled: true, ...shortcuts });
  return (
    <ResultDetailPhoto
      record={{
        address: '16 Rue Lavoisier 69003 Lyon',
        point: { latitude: 45.7578, longitude: 4.8515 },
      }}
      streetViewEnabled
      streetViewEmbedKey="browser-embed-key"
    />
  );
}

async function press(target: Element, key: string): Promise<void> {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  });
}

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

// why: Next.js mounts React on `document`, where the detail shortcuts listen
// too; the dialog's popup stops Escape and the arrow keys in its portal before
// they get there. It must be the file's only root: React skips listening on a
// document an earlier root already marked.
it('keeps the detail shortcuts away from keys pressed in the panorama dialog', async () => {
  const shortcuts = { onClose: vi.fn(), onPrevious: vi.fn(), onNext: vi.fn() };
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
            <PhotoWithShortcuts {...shortcuts} />
          </NextIntlClientProvider>
        </body>
      </html>,
    );
  });
  const trigger = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Explorer le panorama Street View"]',
  );
  if (trigger === null) throw new Error('no panorama trigger');

  await act(async () => {
    trigger.click();
  });
  const close = dialog()?.querySelector(
    'button[aria-label="Fermer le panorama"]',
  );
  if (close === undefined || close === null) {
    throw new Error('no panorama dialog');
  }

  await press(close, 'ArrowLeft');
  await press(close, 'ArrowRight');
  expect(dialog()).not.toBeNull();
  expect(shortcuts.onPrevious).not.toHaveBeenCalled();
  expect(shortcuts.onNext).not.toHaveBeenCalled();

  await press(close, 'Escape');
  expect(dialog()).toBeNull();
  expect(shortcuts.onClose).not.toHaveBeenCalled();

  await press(trigger, 'Escape');
  expect(shortcuts.onClose).toHaveBeenCalledOnce();
});
