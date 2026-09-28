import { isTrackingParam } from './canonical-url';

// why: the display URL names the listing, not the campaign that led to it;
// a parameter that selects the listing (a page, an id) stays.
export function listingDisplayUrl(canonicalUrl: string): string | null {
  if (!URL.canParse(canonicalUrl)) return null;
  const url = new URL(canonicalUrl);
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname.replace(/\/+$/, '');
  const query = new URLSearchParams(
    [...url.searchParams].filter(([name]) => !isTrackingParam(name)),
  ).toString();
  return query.length > 0 ? `${host}${path}?${query}` : `${host}${path}`;
}
