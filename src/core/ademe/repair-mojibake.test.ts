import { describe, expect, it } from 'vitest';
import { repairMojibake } from './repair-mojibake';

describe('repairMojibake', () => {
  it('repairs the double-encoded apostrophe seen in the ADEME base', () => {
    const broken = `58 Rue de l${String.fromCharCode(0x00e2, 0x20ac, 0x2122)}Abondance 69003 Lyon`;
    expect(broken).toContain(String.fromCharCode(0x20ac));
    expect(repairMojibake(broken)).toBe(
      `58 Rue de l${String.fromCharCode(0x2019)}Abondance 69003 Lyon`,
    );
  });

  it('repairs a double-encoded accented vowel', () => {
    const broken = `All${String.fromCharCode(0x00c3, 0x00a9)}e des Tilleuls`;
    expect(repairMojibake(broken)).toBe('Allée des Tilleuls');
  });

  it('leaves a correctly encoded address untouched', () => {
    const clean = "70 Rue de l'Abondance 69003 Lyon";
    expect(repairMojibake(clean)).toBe(clean);
  });

  it('leaves a correctly encoded accented address untouched', () => {
    const clean = 'Allée des Tilleuls, Saint-Étienne';
    expect(repairMojibake(clean)).toBe(clean);
  });

  it('leaves plain ascii untouched', () => {
    expect(repairMojibake('16 Rue Lavoisier 69003 Lyon')).toBe(
      '16 Rue Lavoisier 69003 Lyon',
    );
  });

  it('returns the input unchanged when the bytes do not re-read as utf-8', () => {
    const notMojibake = `Rue ${String.fromCharCode(0x00c3)} seule`;
    expect(repairMojibake(notMojibake)).toBe(notMojibake);
  });

  it('is idempotent', () => {
    const broken = `l${String.fromCharCode(0x00e2, 0x20ac, 0x2122)}Abondance`;
    const once = repairMojibake(broken);
    expect(repairMojibake(once)).toBe(once);
  });
});
