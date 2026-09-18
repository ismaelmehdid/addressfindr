export type SsrfCheckResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

export function checkUrlScheme(rawUrl: string): SsrfCheckResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'Only https:// URLs are allowed' };
  }
  if (url.hostname.length === 0) {
    return { ok: false, reason: 'Missing hostname' };
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return { ok: false, reason: 'URLs with credentials are not allowed' };
  }
  return { ok: true, url };
}

const PRIVATE_HOSTNAME_PATTERNS: ReadonlyArray<RegExp> = [
  /^localhost$/i,
  /\.localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fe80:/i,
  /^fc00:/i,
  /^fd[0-9a-f]{2}:/i,
];

export function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return PRIVATE_HOSTNAME_PATTERNS.some((p) => p.test(normalized));
}

export function isPrivateIpAddress(ip: string): boolean {
  return isPrivateHostname(ip);
}
