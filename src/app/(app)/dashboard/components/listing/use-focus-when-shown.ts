'use client';

import { type RefObject, useEffect, useRef } from 'react';

// why: a control replaced by other content (the Street View photo by its
// panorama, and the panorama by the photo) would drop keyboard focus to
// <body>. Focus moves to the new content, but only after the user acted on
// this control: content that mounts again later (the photo of the next
// result shown) must not steal focus.
export function useFocusWhenShown(
  targetRef: RefObject<HTMLElement | null>,
  shown: boolean,
): () => void {
  const armed = useRef(false);

  useEffect(() => {
    if (!shown || !armed.current) return;
    armed.current = false;
    targetRef.current?.focus();
  }, [shown, targetRef]);

  return (): void => {
    armed.current = true;
  };
}
