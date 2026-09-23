export type Commune = {
  inseeCode: string;
  name: string;
  postalCodes: readonly string[];
  isArrondissement: boolean;
};

export type CommuneResolution =
  | { kind: 'resolved'; commune: Commune }
  | { kind: 'ambiguous'; candidates: readonly Commune[] }
  | { kind: 'unresolved' };

export const MAX_AMBIGUOUS_CANDIDATES = 20;

// why: un code INSEE fait 5 caracteres et la Corse utilise 2A/2B (2A004).
// \d{5} seul rejette la Corse, [0-9AB]\d{4} aussi.
const INSEE_CODE_PATTERN = /^(\d[AB]\d{3}|\d{5})$/;

export function isInseeCode(value: string): boolean {
  return INSEE_CODE_PATTERN.test(value.toUpperCase());
}
