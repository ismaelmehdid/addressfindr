import { describe, expect, it } from 'vitest';
import { shortcutAction } from './use-detail-shortcuts';

const PLAIN = {
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  defaultPrevented: false,
  targetOwnsKeys: false,
  overlayOpen: false,
};

const SHORTCUT_KEYS = ['Escape', 'ArrowLeft', 'ArrowRight'] as const;

const MODIFIERS = ['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const;

describe('shortcutAction', () => {
  it.each([
    ['Escape', 'close'],
    ['ArrowLeft', 'previous'],
    ['ArrowRight', 'next'],
  ] as const)('maps %s to %s', (key, action) => {
    expect(shortcutAction({ ...PLAIN, key })).toBe(action);
  });

  it.each(
    SHORTCUT_KEYS.flatMap((key) =>
      MODIFIERS.map((modifier) => [key, modifier] as const),
    ),
  )('ignores %s pressed with %s', (key, modifier) => {
    expect(shortcutAction({ ...PLAIN, key, [modifier]: true })).toBeNull();
  });

  it.each(SHORTCUT_KEYS)('ignores %s once already handled', (key) => {
    expect(
      shortcutAction({ ...PLAIN, key, defaultPrevented: true }),
    ).toBeNull();
  });

  it.each(SHORTCUT_KEYS)('leaves %s to an element that owns the key', (key) => {
    expect(shortcutAction({ ...PLAIN, key, targetOwnsKeys: true })).toBeNull();
  });

  it.each(
    SHORTCUT_KEYS,
  )('ignores %s while a dialog is open over the results', (key) => {
    expect(shortcutAction({ ...PLAIN, key, overlayOpen: true })).toBeNull();
  });

  it.each([
    'Enter',
    'Tab',
    ' ',
    'ArrowUp',
    'ArrowDown',
    'a',
    'Esc',
  ])('ignores %j', (key) => {
    expect(shortcutAction({ ...PLAIN, key })).toBeNull();
  });
});
