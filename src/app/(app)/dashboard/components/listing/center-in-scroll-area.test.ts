import { describe, expect, it } from 'vitest';
import { centeredScrollTop } from './center-in-scroll-area';

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
