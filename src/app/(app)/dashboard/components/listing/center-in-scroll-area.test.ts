import { describe, expect, it } from 'vitest';
import { centeredScrollTop, isInView } from './center-in-scroll-area';

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
});
