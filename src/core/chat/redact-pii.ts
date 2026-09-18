const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{0,4}/g;
const CREDIT_CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;

export type RedactionOptions = {
  readonly maxLength?: number;
};

export function redactPii(text: string, opts: RedactionOptions = {}): string {
  let out = text
    .replaceAll(EMAIL_RE, '[redacted-email]')
    .replaceAll(IBAN_RE, '[redacted-iban]')
    .replaceAll(CREDIT_CARD_RE, '[redacted-card]')
    .replaceAll(PHONE_RE, (match) => {
      const digits = match.replace(/\D/g, '');
      if (digits.length < 7) return match;
      return '[redacted-phone]';
    });
  if (opts.maxLength && out.length > opts.maxLength) {
    out = `${out.slice(0, opts.maxLength)}…`;
  }
  return out;
}
