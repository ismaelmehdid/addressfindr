// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  centeredScrollTop,
  isInView,
  revealInScrollArea,
} from './center-in-scroll-area';

describe('centeredScrollTop', () => {
  it('puts the middle of the item at the middle of the viewport', () => {
    expect(
      centeredScrollTop({
        viewportHeight: 400,
        contentHeight: 2000,
        itemTop: 1000,
        itemHeight: 200,
      }),
    ).toBe(900);
  });

  it('never scrolls above the top of the content', () => {
    expect(
      centeredScrollTop({
        viewportHeight: 400,
        contentHeight: 2000,
        itemTop: 50,
        itemHeight: 100,
      }),
    ).toBe(0);
  });

  it('never scrolls past the end of the content', () => {
    expect(
      centeredScrollTop({
        viewportHeight: 400,
        contentHeight: 2000,
        itemTop: 1850,
        itemHeight: 100,
      }),
    ).toBe(1600);
  });

  it('stays at the top when the content fits in the viewport', () => {
    expect(
      centeredScrollTop({
        viewportHeight: 400,
        contentHeight: 300,
        itemTop: 250,
        itemHeight: 40,
      }),
    ).toBe(0);
  });

  // why: centring an item taller than the viewport would hide its top, where
  // a result card shows its photo, rank and score.
  it('aligns the top of an item taller than the viewport', () => {
    expect(
      centeredScrollTop({
        viewportHeight: 300,
        contentHeight: 2000,
        itemTop: 800,
        itemHeight: 450,
      }),
    ).toBe(800);
  });

  it('works in the content frame, whatever the scroll position', () => {
    expect(
      centeredScrollTop({
        viewportHeight: 400,
        contentHeight: 2000,
        itemTop: 602,
        itemHeight: 300,
      }),
    ).toBe(552);
  });
});

describe('isInView', () => {
  const viewport = { viewportTop: 100, viewportHeight: 400 };

  it('accepts an item wholly inside the viewport', () => {
    expect(isInView({ ...viewport, itemTop: 100, itemHeight: 400 })).toBe(true);
    expect(isInView({ ...viewport, itemTop: 250, itemHeight: 100 })).toBe(true);
  });

  it('rejects an item scrolled above or below the viewport', () => {
    expect(isInView({ ...viewport, itemTop: -300, itemHeight: 300 })).toBe(
      false,
    );
    expect(isInView({ ...viewport, itemTop: 600, itemHeight: 300 })).toBe(
      false,
    );
  });

  it('rejects an item cut by an edge of the viewport', () => {
    expect(isInView({ ...viewport, itemTop: 0, itemHeight: 300 })).toBe(false);
    expect(isInView({ ...viewport, itemTop: 400, itemHeight: 300 })).toBe(
      false,
    );
  });

  // why: a result card is taller than the list panel on a phone; centring
  // aligns its top, where it then covers the whole viewport.
  it('accepts an item taller than the viewport once it covers it', () => {
    expect(isInView({ ...viewport, itemTop: 100, itemHeight: 600 })).toBe(true);
    expect(isInView({ ...viewport, itemTop: 150, itemHeight: 600 })).toBe(
      false,
    );
  });

  it('accepts an item touching both edges of the viewport', () => {
    expect(isInView({ ...viewport, itemTop: 100, itemHeight: 400 })).toBe(true);
    expect(isInView({ ...viewport, itemTop: 99, itemHeight: 400 })).toBe(false);
    expect(isInView({ ...viewport, itemTop: 101, itemHeight: 400 })).toBe(
      false,
    );
  });
});

function rect(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom: top + height,
    left: 0,
    right: 336,
    width: 336,
    height,
    toJSON: () => ({}),
  };
}

// why: jsdom lays nothing out. The list's 400px viewport sits 120px down the
// page, scrolled 600px into 2000px of content, so a mistake in the frame a
// box is measured in moves the scroll target.
const VIEWPORT = { top: 120, height: 400, scrollTop: 600, scrollHeight: 2000 };

function list(html: string): {
  viewport: HTMLElement;
  scroll: ReturnType<typeof vi.fn>;
  element: (selector: string) => HTMLElement;
} {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  const viewport = host.querySelector<HTMLElement>(
    '[data-slot="scroll-area-viewport"]',
  );
  if (viewport === null) throw new Error('no scroll area viewport');
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(
    rect(VIEWPORT.top, VIEWPORT.height),
  );
  for (const [property, value] of [
    ['clientHeight', VIEWPORT.height],
    ['scrollTop', VIEWPORT.scrollTop],
    ['scrollHeight', VIEWPORT.scrollHeight],
  ] as const) {
    Object.defineProperty(viewport, property, { configurable: true, value });
  }
  const scroll = vi.fn();
  viewport.scrollTo = scroll;
  return {
    viewport,
    scroll,
    element: (selector) => {
      const found = host.querySelector<HTMLElement>(selector);
      if (found === null) throw new Error(`no ${selector}`);
      return found;
    },
  };
}

function place(element: HTMLElement, top: number, height: number): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect(top, height));
}

const RESULT_CARD = `
  <div data-slot="scroll-area-viewport">
    <div data-slot="card"><button type="button">Résultat</button></div>
  </div>`;

describe('revealInScrollArea', () => {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('leaves a card whose focus ring fits in the viewport where it is', () => {
    const { scroll, element } = list(RESULT_CARD);
    for (const selector of ['[data-slot="card"]', 'button']) {
      place(element(selector), VIEWPORT.top + 4, 300);
    }

    revealInScrollArea(element('button'));

    expect(scroll).not.toHaveBeenCalled();
  });

  it('centres a card scrolled above the viewport, in the content frame', () => {
    const { scroll, element } = list(RESULT_CARD);
    for (const selector of ['[data-slot="card"]', 'button']) {
      place(element(selector), VIEWPORT.top - 500, 300);
    }

    revealInScrollArea(element('button'));

    expect(scroll).toHaveBeenCalledExactlyOnceWith({
      top: 50,
      behavior: 'smooth',
    });
  });

  it('centres a card scrolled below the viewport, in the content frame', () => {
    const { scroll, element } = list(RESULT_CARD);
    for (const selector of ['[data-slot="card"]', 'button']) {
      place(element(selector), VIEWPORT.top + VIEWPORT.height + 60, 300);
    }

    revealInScrollArea(element('button'));

    expect(scroll).toHaveBeenCalledExactlyOnceWith({
      top: 1010,
      behavior: 'smooth',
    });
  });

  // why: the card draws its button's focus ring 2px wide, 2px outside its own
  // edge (outline-2 outline-offset-2); a card 2px inside the viewport has its
  // ring clipped although the card itself fits.
  it('centres a card whose focus ring is cut by an edge of the viewport', () => {
    const { scroll, element } = list(RESULT_CARD);
    place(element('[data-slot="card"]'), VIEWPORT.top + 2, 300);
    place(element('button'), VIEWPORT.top + 2, 300);

    revealInScrollArea(element('button'));

    expect(scroll).toHaveBeenCalledExactlyOnceWith({
      top: 552,
      behavior: 'smooth',
    });
  });

  it('measures the card that draws the ring, not the focused button inside it', () => {
    const { scroll, element } = list(RESULT_CARD);
    place(element('[data-slot="card"]'), VIEWPORT.top - 40, 300);
    place(element('button'), VIEWPORT.top + 10, 250);

    revealInScrollArea(element('button'));

    expect(scroll).toHaveBeenCalledOnce();
  });

  it('measures an element outside any card on its own', () => {
    const { scroll, element } = list(`
      <div data-slot="card">
        <div data-slot="scroll-area-viewport">
          <h2 tabindex="-1">Adresse</h2>
        </div>
      </div>`);
    place(element('[data-slot="card"]'), -900, 3000);
    place(element('h2'), VIEWPORT.top + 40, 24);

    revealInScrollArea(element('h2'));

    expect(scroll).not.toHaveBeenCalled();
  });

  it('does nothing outside a scroll area', () => {
    const host = document.createElement('div');
    host.innerHTML = '<button type="button">Résultat</button>';
    document.body.append(host);
    const button = host.querySelector('button');
    if (button === null) throw new Error('no button');
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    revealInScrollArea(button);

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
