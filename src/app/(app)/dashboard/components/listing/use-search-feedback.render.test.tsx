// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as v from 'valibot';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '@/i18n/messages/fr.json';
import { ConfirmListingButton } from './confirm-listing-button';
import { MissingListingFeedback } from './missing-listing-feedback';
import { useSearchFeedback } from './use-search-feedback';

const LISTING_URL =
  'https://www.leboncoin.fr/ad/ventes_immobilieres/3012345678';
const FIRST_DPE = '2269E0123456X';
const SECOND_DPE = '2269E0654321Y';
const NONE_MATCH_CONTROL = 'none-match';
const CANDIDATES = [
  { record: { dpeNumber: FIRST_DPE }, confidence: 0.92 },
  { record: { dpeNumber: SECOND_DPE }, confidence: 0.81 },
];

const VerdictRequestSchema = v.object({
  searchId: v.string(),
  verdict: v.string(),
});

function FeedbackControls(): React.ReactElement {
  const feedback = useSearchFeedback({
    listingUrl: LISTING_URL,
    candidates: CANDIDATES,
  });
  return (
    <>
      <div data-control={FIRST_DPE}>
        <ConfirmListingButton feedback={feedback} dpeNumber={FIRST_DPE} />
      </div>
      <div data-control={SECOND_DPE}>
        <ConfirmListingButton feedback={feedback} dpeNumber={SECOND_DPE} />
      </div>
      <div data-control={NONE_MATCH_CONTROL}>
        <MissingListingFeedback feedback={feedback} />
      </div>
    </>
  );
}

function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function receiptFor(init: RequestInit | undefined): Response {
  const request = v.parse(VerdictRequestSchema, JSON.parse(String(init?.body)));
  return new Response(
    JSON.stringify({ searchId: request.searchId, verdict: request.verdict }),
  );
}

// why: the first verdict fails, the second stays in flight until released, so
// the test can look at the spinners while the second attempt is sending.
function failThenHold(): () => Promise<void> {
  let release = (): void => {};
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockImplementationOnce(
        (_path, init) =>
          new Promise<Response>((resolve) => {
            release = () => {
              resolve(receiptFor(init));
            };
          }),
      ),
  );
  return () =>
    act(async () => {
      release();
      await settle();
    });
}

let mounted: { root: Root; container: HTMLDivElement } | null = null;

async function renderControls(): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () => {
    root.render(
      <NextIntlClientProvider
        locale="fr"
        timeZone="Europe/Paris"
        messages={messages}
      >
        <FeedbackControls />
      </NextIntlClientProvider>,
    );
  });
  return container;
}

function controlOf(container: HTMLElement, control: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(
    `[data-control="${control}"]`,
  );
  if (!element) throw new Error(`no control ${control}`);
  return element;
}

function buttonOf(container: HTMLElement, control: string): HTMLButtonElement {
  const button = controlOf(container, control).querySelector('button');
  if (!button) throw new Error(`no button in ${control}`);
  return button;
}

function isSpinning(button: HTMLButtonElement): boolean {
  return button.hasAttribute('data-loading');
}

async function press(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
    await settle();
  });
}

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

afterEach(async () => {
  const current = mounted;
  mounted = null;
  if (current) {
    await act(async () => {
      current.root.unmount();
    });
    current.container.remove();
  }
  vi.unstubAllGlobals();
});

describe('feedback controls while a verdict is sending', () => {
  it('spins only the confirm button pressed after a failed none-match', async () => {
    const release = failThenHold();
    const container = await renderControls();

    await press(buttonOf(container, NONE_MATCH_CONTROL));
    expect(
      controlOf(container, NONE_MATCH_CONTROL).querySelector('[role="alert"]'),
    ).not.toBeNull();
    expect(isSpinning(buttonOf(container, NONE_MATCH_CONTROL))).toBe(false);

    await press(buttonOf(container, FIRST_DPE));
    expect(isSpinning(buttonOf(container, FIRST_DPE))).toBe(true);
    expect(isSpinning(buttonOf(container, SECOND_DPE))).toBe(false);
    expect(isSpinning(buttonOf(container, NONE_MATCH_CONTROL))).toBe(false);

    await release();
    expect(controlOf(container, FIRST_DPE).textContent).toBe(
      messages.ListingFeedback.confirmed,
    );
  });

  it('spins only the none-match button pressed after a failed confirmation', async () => {
    const release = failThenHold();
    const container = await renderControls();

    await press(buttonOf(container, FIRST_DPE));
    expect(
      controlOf(container, FIRST_DPE).querySelector('[role="alert"]'),
    ).not.toBeNull();
    expect(isSpinning(buttonOf(container, FIRST_DPE))).toBe(false);

    await press(buttonOf(container, NONE_MATCH_CONTROL));
    expect(isSpinning(buttonOf(container, NONE_MATCH_CONTROL))).toBe(true);
    expect(isSpinning(buttonOf(container, FIRST_DPE))).toBe(false);
    expect(isSpinning(buttonOf(container, SECOND_DPE))).toBe(false);

    await release();
    expect(controlOf(container, NONE_MATCH_CONTROL).textContent).toContain(
      messages.ListingFeedback.thanks,
    );
  });
});
