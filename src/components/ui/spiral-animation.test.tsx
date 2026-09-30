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

const TRAIL_LENGTH = 80;
const TRAIL_REACH = 170 + 28 + 10;

type Arc = { x: number; y: number; radius: number };

type FakeContext = {
  [method in
    | 'beginPath'
    | 'clearRect'
    | 'fill'
    | 'moveTo'
    | 'restore'
    | 'rotate'
    | 'save'
    | 'setTransform'
    | 'translate']: Mock<(...args: number[]) => void>;
} & {
  arc: Mock<(x: number, y: number, radius: number) => void>;
  fillStyle: string;
};

// why: a real context throws on a negative radius; the fake must too, or a
// broken radius would pass here and throw on every frame in a browser.
function fakeContext(): FakeContext {
  return {
    arc: vi.fn((_x: number, _y: number, radius: number) => {
      if (radius < 0) throw new RangeError(`negative radius ${radius}`);
    }),
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
type Animated = { time: number };

let context: FakeContext | null;
let reducedMotion: boolean;
let size: { width: number; height: number };
let resizeCallback: (() => void) | null;
let disconnect: Mock<() => void>;
let resolutionListeners: Map<string, () => void>;
let tweens: { target: Animated; vars: gsap.TweenVars; tween: Tween }[];
let container: HTMLDivElement;
let root: Root;

// why: jsdom has no 2D canvas, no ResizeObserver, no layout and no media
// queries, so each is replaced by a fake the test can drive.
beforeEach(() => {
  context = fakeContext();
  reducedMotion = false;
  size = { width: 300, height: 200 };
  resizeCallback = null;
  disconnect = vi.fn();
  resolutionListeners = new Map();
  tweens = [];

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    () => size.width,
  );
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
    () => size.height,
  );
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
    matches: query.includes('reduced-motion') && reducedMotion,
    media: query,
    onchange: null,
    addEventListener: ((_: string, listener: () => void) => {
      resolutionListeners.set(query, listener);
    }) as MediaQueryList['addEventListener'],
    removeEventListener: () => {
      resolutionListeners.delete(query);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  vi.spyOn(gsap, 'to').mockImplementation(((
    target: Animated,
    vars: gsap.TweenVars,
  ) => {
    const tween = { kill: vi.fn() };
    tweens.push({ target, vars, tween });
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

function onlyTween(): (typeof tweens)[number] {
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

function arcsAt(time: number): Arc[] {
  const { target, vars } = onlyTween();
  context?.arc.mockClear();
  act(() => {
    target.time = time;
    vars.onUpdate?.();
  });
  return (context?.arc.mock.calls ?? []).map(([x, y, radius]) => ({
    x,
    y,
    radius,
  }));
}

describe('SpiralAnimation', () => {
  it('hides the decorative canvas from assistive technology', () => {
    render();

    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(container.firstElementChild?.className).toContain('text-linen');
  });

  it('sizes the canvas to its container layout at the device pixel ratio', () => {
    render();

    expect(canvas().width).toBe(600);
    expect(canvas().height).toBe(400);
    expect(context?.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
    expect(context?.translate).toHaveBeenLastCalledWith(150, 100);
  });

  it('redraws at the new size when the container is resized', () => {
    render();
    size = { width: 500, height: 400 };

    act(() => {
      resizeCallback?.();
    });

    expect(canvas().width).toBe(1000);
    expect(canvas().height).toBe(800);
    expect(context?.translate).toHaveBeenLastCalledWith(250, 200);
  });

  it('resizes the buffer when the pixel ratio changes at the same size', () => {
    render();
    const onChange = resolutionListeners.get('(resolution: 2dppx)');
    expect(onChange).toBeDefined();
    vi.stubGlobal('devicePixelRatio', 1);

    act(() => {
      onChange?.();
    });

    expect(canvas().width).toBe(300);
    expect(canvas().height).toBe(200);
    expect(resolutionListeners.has('(resolution: 2dppx)')).toBe(false);
    expect(resolutionListeners.has('(resolution: 1dppx)')).toBe(true);
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
    expect(beginPaths).toBeGreaterThan(0);
    expect(context?.fill.mock.calls.length).toBe(beginPaths);
  });

  it('draws only the trail before any star leaves the spiral', () => {
    render();

    expect(arcsAt(0)).toHaveLength(TRAIL_LENGTH);
  });

  it('winds the trail around the centre, within the spiral radius', () => {
    render();

    const heads = [0.05, 0.1, 0.15, 0.2, 0.25].map((time) => {
      const trail = arcsAt(time).slice(0, TRAIL_LENGTH);
      for (const { x, y } of trail) {
        expect(Math.hypot(x, y)).toBeLessThanOrEqual(TRAIL_REACH);
      }
      const [head] = trail;
      if (head === undefined) throw new Error('no trail');
      return head;
    });

    expect(heads.some(({ x }) => x < 0)).toBe(true);
    expect(heads.some(({ x }) => x > 0)).toBe(true);
    expect(heads.some(({ y }) => y < 0)).toBe(true);
  });

  it('releases the stars as the spiral unwinds, and the camera flies past them', () => {
    render();

    const unwinding = arcsAt(0.3).length - TRAIL_LENGTH;
    const exploded = arcsAt(0.55).length - TRAIL_LENGTH;
    const passed = arcsAt(0.99).length - TRAIL_LENGTH;

    expect(unwinding).toBeGreaterThan(0);
    expect(exploded).toBeGreaterThan(unwinding);
    expect(passed).toBeLessThan(exploded / 10);
  });

  it('only ever draws finite dots with a non-negative radius', () => {
    render();

    for (const time of [0, 0.1, 0.32, 0.33, 0.5, 0.75, 0.99]) {
      for (const { x, y, radius } of arcsAt(time)) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(radius).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(radius)).toBe(true);
      }
    }
  });

  it('stops the animation, the resize observer and the ratio watch when unmounted', () => {
    render();
    const { tween } = onlyTween();

    act(() => {
      root.unmount();
    });

    expect(tween.kill).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
    expect(resolutionListeners.size).toBe(0);
    root = createRoot(container);
  });

  it('draws one still frame and never animates when motion is reduced', () => {
    reducedMotion = true;

    render();

    expect(tweens).toHaveLength(0);
    expect(context?.fill).toHaveBeenCalled();
    expect(context?.arc.mock.calls.length).toBeGreaterThan(TRAIL_LENGTH);
  });

  it('does nothing without a 2D context', () => {
    context = null;

    render();

    expect(tweens).toHaveLength(0);
    expect(resizeCallback).toBeNull();
  });
});
