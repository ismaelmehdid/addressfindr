import type {
  EntityIndexMetadata,
  EntityIndexMetadataValue,
  ZeroEntropyWireMetadata,
} from './types';

const NUMBER_OFFSET = 1_000_000_000_000_000;
const NUMBER_WIDTH = 16;

const VALID_ATTR_NAME = /^[a-zA-Z0-9_-]+$/;

export class InvalidMetadataAttrNameError extends Error {
  constructor(name: string) {
    super(
      `Invalid ZeroEntropy metadata attribute name "${name}". Must match ${VALID_ATTR_NAME}.`,
    );
    this.name = 'InvalidMetadataAttrNameError';
  }
}

export class MetadataValueOutOfRangeError extends Error {
  constructor(value: number) {
    super(
      `Numeric metadata value out of supported encoding range: ${value}. Max absolute value supported is ${NUMBER_OFFSET}.`,
    );
    this.name = 'MetadataValueOutOfRangeError';
  }
}

export function encodeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new MetadataValueOutOfRangeError(n);
  }
  if (Math.abs(n) >= NUMBER_OFFSET) {
    throw new MetadataValueOutOfRangeError(n);
  }
  const shifted = Math.round(n + NUMBER_OFFSET);
  return shifted.toString().padStart(NUMBER_WIDTH, '0');
}

export function decodeNumber(s: string): number {
  return Number.parseInt(s, 10) - NUMBER_OFFSET;
}

export function encodeBoolean(b: boolean): string {
  return b ? 'true' : 'false';
}

export function decodeBoolean(s: string): boolean {
  return s === 'true';
}

export function encodeDateIso(d: Date): string {
  return d.toISOString();
}

function encodeValue(v: EntityIndexMetadataValue): string | string[] {
  if (Array.isArray(v)) return v.slice();
  if (typeof v === 'number') return encodeNumber(v);
  if (typeof v === 'boolean') return encodeBoolean(v);
  return v;
}

export function encodeMetadataForWire(
  metadata: EntityIndexMetadata,
): ZeroEntropyWireMetadata {
  const out: ZeroEntropyWireMetadata = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (!VALID_ATTR_NAME.test(k)) {
      throw new InvalidMetadataAttrNameError(k);
    }
    out[k] = encodeValue(v);
  }
  return out;
}

export function listFilterKey(attrName: string): string {
  return `list:${attrName}`;
}
