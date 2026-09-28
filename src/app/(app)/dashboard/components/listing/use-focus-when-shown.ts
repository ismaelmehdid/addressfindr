'use client';

import { type RefObject, useEffect, useRef } from 'react';

// why: a feedback control is replaced by its status line once the server
// records it, which would drop keyboard focus to <body>. Focus moves to that
// line, but only after the user acted on this control: a status that mounts
// again later (paging back to a confirmed result) must not steal focus.
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
