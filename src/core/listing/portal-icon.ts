import type { PortalId } from './types';

// why: the icons ship with the app (public/portal-icons), so showing one
// sends no request to a third party.
export function portalIconUrl(portal: PortalId): string {
  return `/portal-icons/${portal}.png`;
}
