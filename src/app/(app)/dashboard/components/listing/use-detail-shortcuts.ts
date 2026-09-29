'use client';

import { useEffect, useEffectEvent } from 'react';

type ShortcutAction = 'close' | 'previous' | 'next';

// why: these elements already give Escape or the arrow keys a meaning (the
// text caret, a radio group, a toggle group's roving focus, the map's own
// keyboard panning); a shortcut must never steal the key from them.
const KEY_OWNERS = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="radiogroup"]',
  '[data-slot="toggle-group"]',
  '[role="application"]',
].join(', ');

function ownsKeys(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(KEY_OWNERS) !== null;
}

// why: a dialog over the results owns the keyboard. Its popup stops the keys
// pressed inside it, but focus can still fall to <body> (a control disabled
// under the pointer), and a key pressed there must not page or close the
// detail behind the dialog. Spread onto the popup of every such dialog.
export const SUSPENDS_DETAIL_SHORTCUTS = {
  'data-suspends-detail-shortcuts': '',
} as const;

function suspendingOverlayOpen(): boolean {
  return document.querySelector('[data-suspends-detail-shortcuts]') !== null;
}

export function shortcutAction(input: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  targetOwnsKeys: boolean;
  overlayOpen: boolean;
}): ShortcutAction | null {
  if (input.defaultPrevented || input.targetOwnsKeys || input.overlayOpen) {
    return null;
  }
  if (input.altKey || input.ctrlKey || input.metaKey || input.shiftKey) {
    return null;
  }
  switch (input.key) {
    case 'Escape':
      return 'close';
    case 'ArrowLeft':
      return 'previous';
    case 'ArrowRight':
      return 'next';
    default:
      return null;
  }
}

export function useDetailShortcuts({
  enabled,
  onClose,
  onPrevious,
  onNext,
}: {
  enabled: boolean;
  onClose: (() => void) | null;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
}): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const action = shortcutAction({
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      defaultPrevented: event.defaultPrevented,
      targetOwnsKeys: ownsKeys(event.target),
      overlayOpen: suspendingOverlayOpen(),
    });
    if (action === null) return;
    const handlers = { close: onClose, previous: onPrevious, next: onNext };
    const handler = handlers[action];
    if (handler === null) return;
    event.preventDefault();
    handler();
  });

  useEffect(() => {
    if (!enabled) return;
    function handleKeyDown(event: KeyboardEvent): void {
      onKeyDown(event);
    }
    document.addEventListener('keydown', handleKeyDown);
    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled]);
}
