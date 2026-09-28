import { portalDomain } from './portal-registry';
import type { PortalId } from './types';

// why: Google's s2 favicon endpoint is public and keyless. It is sent the
// portal's registered domain only, never the listing URL.
const FAVICON_ENDPOINT = 'https://www.google.com/s2/favicons';
const FAVICON_SIZE_PX = 64;

export function portalIconUrl(portal: PortalId): string | null {
  const domain = portalDomain(portal);
  if (domain === null) return null;
  const query = new URLSearchParams({ domain, sz: String(FAVICON_SIZE_PX) });
  return `${FAVICON_ENDPOINT}?${query.toString()}`;
}
