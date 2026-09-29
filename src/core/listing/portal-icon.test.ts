import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { portalIconUrl } from './portal-icon';
import { PORTAL_IDS } from './types';

const PORTAL_ICONS_DIR = fileURLToPath(
  new URL('../../../public/portal-icons/', import.meta.url),
);
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe('portalIconUrl', () => {
  it('serves the icon of a portal from the app itself', () => {
    expect(portalIconUrl('leboncoin')).toBe('/portal-icons/leboncoin.png');
  });

  // why: fetching a favicon from a third party at runtime would hand it the
  // visitor's IP address and the app's origin on every result.
  it.each(
    PORTAL_IDS,
  )('never sends the browser to another host for %s', (portal) => {
    const origin = 'https://app.test';

    expect(new URL(portalIconUrl(portal), origin).origin).toBe(origin);
  });
});

describe('bundled portal icons', () => {
  // why: Finder drops a gitignored .DS_Store into any folder it opens.
  it('holds exactly one icon per portal, and nothing else', () => {
    const icons = readdirSync(PORTAL_ICONS_DIR)
      .filter((name) => !name.startsWith('.'))
      .sort();

    expect(icons).toEqual(PORTAL_IDS.map((portal) => `${portal}.png`).sort());
  });

  it.each(PORTAL_IDS)('holds a PNG image for %s', (portal) => {
    const bytes = readFileSync(`${PORTAL_ICONS_DIR}${portal}.png`);

    expect([...bytes.subarray(0, PNG_SIGNATURE.length)]).toEqual(PNG_SIGNATURE);
  });
});
