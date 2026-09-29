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

function panoramaTrigger(): HTMLButtonElement {
  const trigger = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Explorer le panorama Street View"]',
  );
  if (trigger === null) throw new Error('no panorama trigger');
  return trigger;
}

async function explore(): Promise<Element> {
  await act(async () => {
    panoramaTrigger().click();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
  const back = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === 'Retour à la photo',
  );
  if (back === undefined) throw new Error('no panorama shown');
  return back;
}

// why: Next.js mounts React on `document`, where the detail shortcuts listen
// too, so nothing the panorama does can stop the key reaching them; it marks
// Escape handled instead. It must be the file's only root: React skips
// listening on a document an earlier root already marked.
it('leaves the panorama on Escape without closing the detail, which the next Escape closes', async () => {
  const shortcuts = { onClose: vi.fn(), onPrevious: vi.fn(), onNext: vi.fn() };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ panoId: 'CAoSLEFGMVFpcE1', heading: 212 }),
    ),
  );
  const root = createRoot(document);
  onTestFinished(() => {
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
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

  const back = await explore();
  expect(document.activeElement).toBe(back);
  expect(document.querySelector('iframe')).not.toBeNull();

  // why: only Escape is claimed; the arrow keys still page the results.
  await press(back, 'ArrowLeft');
  await press(back, 'ArrowRight');
  expect(shortcuts.onPrevious).toHaveBeenCalledOnce();
  expect(shortcuts.onNext).toHaveBeenCalledOnce();

  await press(back, 'Escape');
  expect(shortcuts.onClose).not.toHaveBeenCalled();
  expect(document.querySelector('iframe')).toBeNull();
  expect(document.activeElement).toBe(panoramaTrigger());

  await press(panoramaTrigger(), 'Escape');
  expect(shortcuts.onClose).toHaveBeenCalledOnce();
});
