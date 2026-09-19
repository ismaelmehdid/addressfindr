const CHALLENGE_MARKERS =
  /geo\.captcha-delivery\.com|\/challenge-platform\/|cf-chl-|Vous avez été bloqué|Access denied/i;

const BLOCKED_STATUS = new Set([401, 403, 429, 503]);

// why: une page servie normalement charge quand meme le script anti-bot —
// seule la conjonction "page tres courte + marqueur de challenge" est un blocage
const SHORT_PAGE_CHARS = 1500;

export function looksBlocked(args: {
  markdown: string;
  statusCode: number | null;
}): boolean {
  if (args.statusCode !== null && BLOCKED_STATUS.has(args.statusCode)) {
    return true;
  }
  if (args.markdown.length >= SHORT_PAGE_CHARS) return false;
  return CHALLENGE_MARKERS.test(args.markdown);
}

const UNSUPPORTED_SUBJECTS =
  /terrain(?!\s+(?:arbor|clos|de\s+\d))|local\s+commercial|fonds?\s+de\s+commerce|bureaux?\b|entrep[ôo]t|place\s+de\s+parking|box\s+ferm[ée]|cave\s+seule|immeuble\s+de\s+rapport/i;

export function isUnsupportedCategory(text: string): boolean {
  const head = text.slice(0, 400);
  if (/appartement|maison|studio|duplex|villa|loft/i.test(head)) return false;
  return UNSUPPORTED_SUBJECTS.test(head);
}
