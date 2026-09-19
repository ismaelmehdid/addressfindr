import { canonicalizeListingUrl } from './canonical-url';
import { resolvePortal } from './portal-registry';
import type { PortalId } from './types';

export type ListingUrlRejection = 'empty' | 'malformed' | 'unsupported-portal';

export type ListingUrlValidation =
  | { ok: true; portal: PortalId; canonicalUrl: string }
  | { ok: false; reason: ListingUrlRejection };

export function validateListingUrl(raw: string): ListingUrlValidation {
  if (raw.trim().length === 0) return { ok: false, reason: 'empty' };

  const canonicalUrl = canonicalizeListingUrl(raw);
  if (canonicalUrl === null) return { ok: false, reason: 'malformed' };

  const portal = resolvePortal(new URL(canonicalUrl).hostname);
  if (portal === null) return { ok: false, reason: 'unsupported-portal' };

  return { ok: true, portal, canonicalUrl };
}
