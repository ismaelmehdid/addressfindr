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

async function press(
  target: Element,
  key: string,
  modifiers: KeyboardEventInit = {},
): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
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
  const panorama = document.querySelector('[role="group"]');
  if (panorama === null) throw new Error('no panorama shown');
  return panorama;
}

// why: Next.js mounts React on `document`, where the detail shortcuts listen
// too, so nothing the panorama does can stop a key reaching them; it marks the
// key handled instead. Every root in this file is mounted on `document`:
// React skips listening on a document an earlier container root marked.
async function mountOnDocument(shortcuts: Shortcuts): Promise<void> {
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
}

it('leaves the panorama on Escape without closing the detail, which the next Escape closes', async () => {
  const shortcuts = { onClose: vi.fn(), onPrevious: vi.fn(), onNext: vi.fn() };
  await mountOnDocument(shortcuts);

  const panorama = await explore();
  expect(document.activeElement).toBe(panorama);
  expect(document.querySelector('iframe')).not.toBeNull();

  await press(panorama, 'Escape');
  expect(shortcuts.onClose).not.toHaveBeenCalled();
  expect(document.querySelector('iframe')).toBeNull();
  expect(document.activeElement).toBe(panoramaTrigger());

  await press(panoramaTrigger(), 'Escape');
  expect(shortcuts.onClose).toHaveBeenCalledOnce();
});

// why: Street View is turned with the arrow keys. Paging to another result
// from the panorama would remount the photo, discarding the panorama and
// dropping focus to <body>, so the arrow keys page again only once the photo
// is back.
it('keeps the arrow keys from paging the results while the panorama is explored', async () => {
  const shortcuts = { onClose: vi.fn(), onPrevious: vi.fn(), onNext: vi.fn() };
  await mountOnDocument(shortcuts);

  const panorama = await explore();
  const claimed = [
    await press(panorama, 'ArrowLeft'),
    await press(panorama, 'ArrowRight'),
  ];

  expect(claimed.map((event) => event.defaultPrevented)).toEqual([true, true]);
  expect(shortcuts.onPrevious).not.toHaveBeenCalled();
  expect(shortcuts.onNext).not.toHaveBeenCalled();
  expect(document.querySelector('iframe')).not.toBeNull();
  expect(document.activeElement).toBe(panorama);

  // why: a modified arrow is no shortcut, and Alt+Left is the browser's Back.
  expect(
    (await press(panorama, 'ArrowLeft', { altKey: true })).defaultPrevented,
  ).toBe(false);

  await press(panorama, 'Escape');
  await press(panoramaTrigger(), 'ArrowRight');
  expect(shortcuts.onNext).toHaveBeenCalledOnce();
});
