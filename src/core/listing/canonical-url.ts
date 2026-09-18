const TRACKING_PARAM_PREFIXES = ['utm_', 'gcl', 'fb', 'mc_', '_hs'];
const TRACKING_PARAMS = new Set([
  'serp_view',
  'search',
  'gclid',
  'fbclid',
  'msclkid',
  'ref',
  'referrer',
  'cmp',
  'came_from',
  'm',
  'ln',
]);

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase();
  if (TRACKING_PARAMS.has(k)) return true;
  return TRACKING_PARAM_PREFIXES.some((p) => k.startsWith(p));
}

export function canonicalizeListingUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  for (const key of [...url.searchParams.keys()]) {
    if (isTrackingParam(key)) url.searchParams.delete(key);
  }
  url.hash = '';
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return url.toString();
}
