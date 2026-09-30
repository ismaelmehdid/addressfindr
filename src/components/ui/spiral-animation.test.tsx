// @vitest-environment jsdom
import { gsap } from 'gsap';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import { SpiralAnimation } from './spiral-animation';

// why: tells React that act() drives the updates, so it flushes them there.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type FakeContext = {
  [method in
    | 'arc'
    | 'beginPath'
    | 'clearRect'
    | 'fill'
    | 'moveTo'
    | 'restore'
    | 'rotate'
    | 'save'
    | 'setTransform'
    | 'translate']: Mock<() => void>;
} & { fillStyle: string };

function fakeContext(): FakeContext {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
    fillStyle: '',
  };
}

type Tween = { kill: Mock<() => void> };

let context: FakeContext | null;
let reducedMotion: boolean;
let resizeCallback: (() => void) | null;
let disconnect: Mock<() => void>;
let tweens: { vars: gsap.TweenVars; tween: Tween }[];
let container: HTMLDivElement;
let root: Root;

// why: jsdom has no 2D canvas, no ResizeObserver and no layout, so each is
// replaced by a fake the test can drive.
beforeEach(() => {
  context = fakeContext();
  reducedMotion = false;
  resizeCallback = null;
  disconnect = vi.fn();
  tweens = [];

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 300,
    height: 200,
  } as DOMRect);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resizeCallback = callback;
      }
      observe(): void {}
      disconnect(): void {
        disconnect();
      }
    },
  );
  vi.stubGlobal('devicePixelRatio', 2);
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: reducedMotion,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  vi.spyOn(gsap, 'to').mockImplementation(((
    _: object,
    vars: gsap.TweenVars,
  ) => {
    const tween = { kill: vi.fn() };
    tweens.push({ vars, tween });
    return tween;
  }) as unknown as typeof gsap.to);

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function render(): void {
  act(() => {
    root.render(<SpiralAnimation className="text-linen" />);
  });
}

function onlyTween(): { vars: gsap.TweenVars; tween: Tween } {
  const [first, ...others] = tweens;
  if (first === undefined || others.length > 0) {
    throw new Error(`expected one tween, got ${tweens.length}`);
  }
  return first;
}

function canvas(): HTMLCanvasElement {
  const element = container.querySelector('canvas');
  if (element === null) throw new Error('no canvas');
  return element;
}

describe('SpiralAnimation', () => {
  it('hides the decorative canvas from assistive technology', () => {
    render();

    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(container.firstElementChild?.className).toContain('text-linen');
  });

  it('sizes the canvas to its container at the device pixel ratio', () => {
    render();

    expect(canvas().width).toBe(600);
    expect(canvas().height).toBe(400);
    expect(context?.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
    expect(context?.translate).toHaveBeenLastCalledWith(150, 100);
  });

  it('redraws at the new size when the container is resized', () => {
    render();
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({
      width: 500,
      height: 400,
    } as DOMRect);

    act(() => {
      resizeCallback?.();
    });

    expect(canvas().width).toBe(1000);
    expect(canvas().height).toBe(800);
    expect(context?.translate).toHaveBeenLastCalledWith(250, 200);
  });

  it('loops one 15 second linear tween that draws every update', () => {
    render();

    const { vars } = onlyTween();
    expect(vars).toMatchObject({
      time: 1,
      duration: 15,
      ease: 'none',
      repeat: -1,
    });

    const drawn = context?.fill.mock.calls.length ?? 0;
    act(() => {
      vars.onUpdate?.();
    });
    expect(context?.fill.mock.calls.length).toBe(drawn + 1);
  });

  it('draws every dot in one filled path per frame', () => {
    render();

    const beginPaths = context?.beginPath.mock.calls.length ?? 0;
    const fills = context?.fill.mock.calls.length ?? 0;
    expect(beginPaths).toBeGreaterThan(0);
    expect(fills).toBe(beginPaths);
    expect(context?.arc.mock.calls.length).toBeGreaterThan(fills);
  });

  it('stops the animation and the resize observer when unmounted', () => {
    render();
    const { tween } = onlyTween();

    act(() => {
      root.unmount();
    });

    expect(tween.kill).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
    root = createRoot(container);
  });

  it('draws one still frame and never animates when motion is reduced', () => {
    reducedMotion = true;

    render();

    expect(tweens).toHaveLength(0);
    expect(context?.fill).toHaveBeenCalled();
  });

  it('does nothing without a 2D context', () => {
    context = null;

    render();

    expect(tweens).toHaveLength(0);
    expect(resizeCallback).toBeNull();
  });
});
