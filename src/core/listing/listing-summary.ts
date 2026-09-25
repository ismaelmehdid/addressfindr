export function listingDisplayUrl(canonicalUrl: string): string | null {
  if (!URL.canParse(canonicalUrl)) return null;
  const url = new URL(canonicalUrl);
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname.replace(/\/+$/, '');
  return `${host}${path}`;
}
