const UNTRUSTED_OPEN = '<untrusted_source>';
const UNTRUSTED_CLOSE = '</untrusted_source>';

export function wrapUntrusted(text: string): string {
  if (text.length === 0) return text;
  return `${UNTRUSTED_OPEN}\n${stripExistingTags(text)}\n${UNTRUSTED_CLOSE}`;
}

function stripExistingTags(text: string): string {
  return text
    .replaceAll(UNTRUSTED_OPEN, '[stripped:open]')
    .replaceAll(UNTRUSTED_CLOSE, '[stripped:close]');
}
