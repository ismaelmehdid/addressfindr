import { describe, expect, it } from 'vitest';
import {
  decodeBoolean,
  decodeNumber,
  encodeBoolean,
  encodeDateIso,
  encodeMetadataForWire,
  encodeNumber,
  InvalidMetadataAttrNameError,
  listFilterKey,
  MetadataValueOutOfRangeError,
} from './metadata-encoding';

describe('encodeNumber / decodeNumber', () => {
  it('round-trips zero', () => {
    expect(decodeNumber(encodeNumber(0))).toBe(0);
  });

  it('round-trips positive and negative integers', () => {
    expect(decodeNumber(encodeNumber(42))).toBe(42);
    expect(decodeNumber(encodeNumber(-99))).toBe(-99);
    expect(decodeNumber(encodeNumber(1_000_000))).toBe(1_000_000);
  });

  it('round-trips floats by rounding to nearest integer', () => {
    expect(decodeNumber(encodeNumber(3.7))).toBe(4);
    expect(decodeNumber(encodeNumber(-2.4))).toBe(-2);
  });

  it('encodes to a fixed-width string preserving sort order', () => {
    const enc1 = encodeNumber(1);
    const enc2 = encodeNumber(2);
    const enc_neg = encodeNumber(-1);
    expect(enc1.length).toBe(enc2.length);
    expect(enc1.length).toBe(enc_neg.length);
    expect(enc_neg < enc1).toBe(true);
    expect(enc1 < enc2).toBe(true);
  });

  it('throws for non-finite values', () => {
    expect(() => encodeNumber(Infinity)).toThrow(MetadataValueOutOfRangeError);
    expect(() => encodeNumber(NaN)).toThrow(MetadataValueOutOfRangeError);
  });

  it('throws when absolute value at or above the offset', () => {
    expect(() => encodeNumber(1_000_000_000_000_000)).toThrow(
      MetadataValueOutOfRangeError,
    );
    expect(() => encodeNumber(-1_000_000_000_000_000)).toThrow(
      MetadataValueOutOfRangeError,
    );
  });
});

describe('encodeBoolean / decodeBoolean', () => {
  it('encodes to literal "true" / "false"', () => {
    expect(encodeBoolean(true)).toBe('true');
    expect(encodeBoolean(false)).toBe('false');
  });

  it('decodes only "true" as true', () => {
    expect(decodeBoolean('true')).toBe(true);
    expect(decodeBoolean('false')).toBe(false);
    expect(decodeBoolean('anything')).toBe(false);
  });
});

describe('encodeDateIso', () => {
  it('returns ISO string', () => {
    expect(encodeDateIso(new Date('2024-01-15T10:30:00Z'))).toBe(
      '2024-01-15T10:30:00.000Z',
    );
  });
});

describe('encodeMetadataForWire', () => {
  it('encodes mixed types', () => {
    const out = encodeMetadataForWire({
      orgId: 'org-1',
      pageCount: 42,
      isPublic: true,
      tags: ['a', 'b'],
    } as never);
    expect(out.orgId).toBe('org-1');
    expect(out.pageCount).toBe(encodeNumber(42));
    expect(out.isPublic).toBe('true');
    expect(out.tags).toEqual(['a', 'b']);
  });

  it('clones array values (does not retain reference)', () => {
    const arr = ['x', 'y'];
    const out = encodeMetadataForWire({ tags: arr } as never) as Record<
      string,
      string | string[]
    >;
    expect(out.tags).toEqual(arr);
    expect(out.tags).not.toBe(arr);
  });

  it('throws on invalid attribute names', () => {
    expect(() => encodeMetadataForWire({ 'bad name': 'x' } as never)).toThrow(
      InvalidMetadataAttrNameError,
    );
    expect(() => encodeMetadataForWire({ 'foo.bar': 'x' } as never)).toThrow(
      InvalidMetadataAttrNameError,
    );
    expect(() => encodeMetadataForWire({ '': 'x' } as never)).toThrow(
      InvalidMetadataAttrNameError,
    );
  });

  it('accepts attribute names with letters, digits, underscores, dashes', () => {
    const out = encodeMetadataForWire({ a_b: 'x', '0-9': 'y' } as never);
    expect(out.a_b).toBe('x');
    expect(out['0-9']).toBe('y');
  });
});

describe('listFilterKey', () => {
  it('prefixes with "list:"', () => {
    expect(listFilterKey('tags')).toBe('list:tags');
  });
});
