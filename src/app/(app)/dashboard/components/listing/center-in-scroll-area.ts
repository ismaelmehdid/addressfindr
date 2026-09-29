const SCROLL_AREA_VIEWPORT = '[data-slot="scroll-area-viewport"]';
const CARD = '[data-slot="card"]';
// why: a result card draws its button's focus ring 2px wide, 2px outside its
// own edge (outline-2 outline-offset-2).
const FOCUS_RING_EXTENT_PX = 4;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

type ViewportBox = { viewportTop: number; viewportHeight: number };
type ItemBox = { itemTop: number; itemHeight: number };

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

// why: an item taller than the viewport can never fit inside it; once it
// covers the viewport it sits where centring would leave it.
export function isInView({
  viewportTop,
  viewportHeight,
  itemTop,
  itemHeight,
}: ViewportBox & ItemBox): boolean {
  const viewportBottom = viewportTop + viewportHeight;
  const itemBottom = itemTop + itemHeight;
  const inside = itemTop >= viewportTop && itemBottom <= viewportBottom;
  const covers = itemTop <= viewportTop && itemBottom >= viewportBottom;
  return inside || covers;
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

// why: focus moved with preventScroll can land on an element the list has
// scrolled away from, leaving its focus indicator off-screen. Only then is it
// centred, so an element already in view never makes the list jump. What must
// fit is the ring, which a card inside the list draws around itself rather
// than around the button that holds focus.
export function revealInScrollArea(element: HTMLElement): void {
  const viewport = element.closest<HTMLElement>(SCROLL_AREA_VIEWPORT);
  if (viewport === null) return;
  const card = element.closest<HTMLElement>(CARD);
  const ringed = card !== null && viewport.contains(card) ? card : element;
  const item = ringed.getBoundingClientRect();
  const visible = isInView({
    viewportTop: viewport.getBoundingClientRect().top + viewport.clientTop,
    viewportHeight: viewport.clientHeight,
    itemTop: item.top - FOCUS_RING_EXTENT_PX,
    itemHeight: item.height + 2 * FOCUS_RING_EXTENT_PX,
  });
  if (!visible) centerInScrollArea(ringed);
}
