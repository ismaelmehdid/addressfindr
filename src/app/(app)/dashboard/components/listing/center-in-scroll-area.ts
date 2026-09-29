const SCROLL_AREA_VIEWPORT = '[data-slot="scroll-area-viewport"]';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export function centeredScrollTop({
  viewportHeight,
  contentHeight,
  itemTop,
  itemHeight,
}: {
  viewportHeight: number;
  contentHeight: number;
  itemTop: number;
  itemHeight: number;
}): number {
  const target =
    itemHeight >= viewportHeight
      ? itemTop
      : itemTop - (viewportHeight - itemHeight) / 2;
  const maxScrollTop = Math.max(0, contentHeight - viewportHeight);
  return Math.min(Math.max(target, 0), maxScrollTop);
}

// why: scrollIntoView also scrolls every scrollable ancestor, which on a phone
// moves the page itself; only the enclosing ScrollArea viewport may move.
export function centerInScrollArea(element: HTMLElement): void {
  const viewport = element.closest<HTMLElement>(SCROLL_AREA_VIEWPORT);
  if (viewport === null) return;
  const viewportTop = viewport.getBoundingClientRect().top + viewport.clientTop;
  const item = element.getBoundingClientRect();
  viewport.scrollTo({
    top: centeredScrollTop({
      viewportHeight: viewport.clientHeight,
      contentHeight: viewport.scrollHeight,
      itemTop: item.top - viewportTop + viewport.scrollTop,
      itemHeight: item.height,
    }),
    behavior: window.matchMedia(REDUCED_MOTION).matches ? 'auto' : 'smooth',
  });
}
