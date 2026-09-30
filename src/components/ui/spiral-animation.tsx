'use client';

import { gsap } from 'gsap';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

type Point = { x: number; y: number };

type Star = {
  spiral: Point;
  spiralLocation: number;
  angle: number;
  distance: number;
  dx: number;
  dy: number;
  rotationDirection: number;
  expansionRate: number;
  z: number;
};

type Frame = {
  time: number;
  width: number;
  height: number;
  color: string;
};

const LOOP_SECONDS = 15;
const CHANGE_EVENT_TIME = 0.32;
const CAMERA_Z = -400;
const CAMERA_TRAVEL_DISTANCE = 3400;
const START_DOT_Y_OFFSET = 28;
const VIEW_ZOOM = 100;
const TRAIL_LENGTH = 80;
const SPIRAL_TURNS = 6;
const SPIRAL_RADIUS = 170;
const DOT_RADIUS = 0.5;
const STAR_SEED = 1234;
// why: the 21st.dev original meant 5000 stars but created them twice (once
// seeded, once not); 10 000 keeps the density its demo shows.
const STAR_COUNT = 10_000;
const REDUCED_MOTION_TIME = 0.3;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const START_DOT = {
  x: 0,
  y: (CAMERA_Z * START_DOT_Y_OFFSET) / VIEW_ZOOM,
  z: CAMERA_TRAVEL_DISTANCE,
};

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function remap(
  value: number,
  from: [number, number],
  to: [number, number],
): number {
  return to[0] + (to[1] - to[0]) * ((value - from[0]) / (from[1] - from[0]));
}

function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t;
}

function ease(p: number, g: number): number {
  return p < 0.5 ? 0.5 * (2 * p) ** g : 1 - 0.5 * (2 * (1 - p)) ** g;
}

function easeOutElastic(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const c4 = (2 * Math.PI) / 4.5;
  return 2 ** (-8 * x) * Math.sin((x * 8 - 0.75) * c4) + 1;
}

function spiralPath(progress: number): Point {
  const p = ease(clamp01(1.2 * progress), 1.8);
  const theta = 2 * Math.PI * SPIRAL_TURNS * Math.sqrt(p);
  const r = SPIRAL_RADIUS * Math.sqrt(p);
  return {
    x: r * Math.cos(theta),
    y: r * Math.sin(theta) + START_DOT_Y_OFFSET,
  };
}

function rotateAboutMidpoint({
  from,
  to,
  progress,
  clockwise,
}: {
  from: Point;
  to: Point;
  progress: number;
  clockwise: boolean;
}): Point {
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const dx = from.x - middle.x;
  const dy = from.y - middle.y;
  const r = Math.sqrt(dx * dx + dy * dy);
  const bounce = Math.sin(progress * Math.PI) * 0.05 * (1 - progress);
  const angle =
    Math.atan2(dy, dx) +
    (clockwise ? -1 : 1) * Math.PI * easeOutElastic(progress);
  return {
    x: middle.x + r * (1 + bounce) * Math.cos(angle),
    y: middle.y + r * (1 + bounce) * Math.sin(angle),
  };
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

function createStars(): Star[] {
  const random = seededRandom(STAR_SEED);
  return Array.from({ length: STAR_COUNT }, () => {
    const angle = random() * Math.PI * 2;
    const distance = 30 * random() + 15;
    const rotationDirection = random() > 0.5 ? 1 : -1;
    const expansionRate = 1.2 + random() * 0.8;
    const spiralLocation = (1 - (1 - random()) ** 3) / 1.3;
    const depth = lerp(
      0.5 * CAMERA_Z,
      CAMERA_TRAVEL_DISTANCE + CAMERA_Z,
      random(),
    );
    return {
      spiral: spiralPath(spiralLocation),
      spiralLocation,
      angle,
      distance,
      dx: distance * Math.cos(angle),
      dy: distance * Math.sin(angle),
      rotationDirection,
      expansionRate,
      z: lerp(depth, CAMERA_TRAVEL_DISTANCE / 2, 0.3 * spiralLocation),
    };
  });
}

function starScreenPosition(star: Star, progress: number): Point {
  const { spiral, dx, dy } = star;
  if (progress < 0.3) {
    const t = lerp(progress, progress ** 2, progress / 0.3) / 0.3;
    return {
      x: lerp(spiral.x, spiral.x + dx * 0.3, t),
      y: lerp(spiral.y, spiral.y + dy * 0.3, t),
    };
  }
  if (progress < 0.7) {
    const t = (progress - 0.3) / 0.4;
    const curve = Math.sin(t * Math.PI) * star.rotationDirection * 1.5;
    return {
      x:
        lerp(spiral.x + dx * 0.3, spiral.x + dx * 0.7, t) -
        dy * 0.4 * curve * t,
      y:
        lerp(spiral.y + dy * 0.3, spiral.y + dy * 0.7, t) +
        dx * 0.4 * curve * t,
    };
  }
  const t = (progress - 0.7) / 0.3;
  const targetDistance = star.distance * star.expansionRate * 1.5;
  const angle = star.angle + 1.2 * star.rotationDirection * t * Math.PI;
  return {
    x: lerp(
      spiral.x + dx * 0.7,
      spiral.x + targetDistance * Math.cos(angle),
      t,
    ),
    y: lerp(
      spiral.y + dy * 0.7,
      spiral.y + targetDistance * Math.sin(angle),
      t,
    ),
  };
}

function traceDot(
  ctx: CanvasRenderingContext2D,
  { x, y, radius }: Point & { radius: number },
): void {
  ctx.moveTo(x + radius, y);
  ctx.arc(x, y, radius, 0, Math.PI * 2);
}

function traceProjectedDot(
  ctx: CanvasRenderingContext2D,
  { x, y, z, cameraZ }: Point & { z: number; cameraZ: number },
): void {
  if (z <= cameraZ) return;
  const depth = z - cameraZ;
  traceDot(ctx, {
    x: (VIEW_ZOOM * x) / depth,
    y: (VIEW_ZOOM * y) / depth,
    radius: DOT_RADIUS,
  });
}

function traceTrail(
  ctx: CanvasRenderingContext2D,
  { t1, time }: { t1: number; time: number },
): void {
  const wobble = Math.sin(time * Math.PI * 2) * 0.5 + 0.5;
  for (let i = 0; i < TRAIL_LENGTH; i++) {
    const falloff = remap(i, [0, TRAIL_LENGTH], [1.1, 0.1]);
    const width = (1.3 * (1 - t1) + 3.0 * Math.sin(Math.PI * t1)) * falloff;
    const position = spiralPath(t1 - 0.00015 * i);
    const rotated = rotateAboutMidpoint({
      from: position,
      to: { x: position.x + 5, y: position.y + 5 },
      progress: wobble,
      clockwise: i % 2 === 0,
    });
    traceDot(ctx, { ...rotated, radius: Math.max(width / 2, 0) });
  }
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  stars: Star[],
): void {
  const { time, width, height } = frame;
  const t1 = clamp01(remap(time, [0, CHANGE_EVENT_TIME + 0.25], [0, 1]));
  const t2 = clamp01(remap(time, [CHANGE_EVENT_TIME, 1], [0, 1]));
  const cameraZ = CAMERA_Z + ease(t2 ** 1.2, 1.8) * CAMERA_TRAVEL_DISTANCE;

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI * ease(t2, 2.7));
  ctx.fillStyle = frame.color;
  ctx.beginPath();

  traceTrail(ctx, { t1, time });

  for (const star of stars) {
    const q = t1 - star.spiralLocation;
    if (q <= 0) continue;
    const screen = starScreenPosition(star, clamp01(4 * q));
    const scale = (star.z - CAMERA_Z) / VIEW_ZOOM;
    traceProjectedDot(ctx, {
      x: screen.x * scale,
      y: screen.y * scale,
      z: star.z,
      cameraZ,
    });
  }

  if (time > CHANGE_EVENT_TIME) {
    traceProjectedDot(ctx, { ...START_DOT, cameraZ });
  }

  ctx.fill();
  ctx.restore();
}

// why: the dots take the element's text colour and the background shows
// through, so both come from Tailwind classes (e.g. `bg-charcoal-deep
// text-linen` on a parent).
export function SpiralAnimation({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!container || !canvas || !ctx) return;

    const stars = createStars();
    const frame: Frame = {
      time: 0,
      width: 0,
      height: 0,
      color: getComputedStyle(canvas).color,
    };
    const draw = (): void => {
      drawFrame(ctx, frame, stars);
    };

    const resize = (): void => {
      const { width, height } = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      frame.width = width;
      frame.height = height;
      draw();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
    let tween: gsap.core.Tween | null = null;
    const applyMotionPreference = (): void => {
      tween?.kill();
      tween = null;
      if (reducedMotion.matches) {
        frame.time = REDUCED_MOTION_TIME;
        draw();
        return;
      }
      frame.time = 0;
      tween = gsap.to(frame, {
        time: 1,
        duration: LOOP_SECONDS,
        ease: 'none',
        repeat: -1,
        onUpdate: draw,
      });
    };
    applyMotionPreference();
    reducedMotion.addEventListener('change', applyMotionPreference);

    return () => {
      reducedMotion.removeEventListener('change', applyMotionPreference);
      tween?.kill();
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={cn('relative size-full', className)}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
