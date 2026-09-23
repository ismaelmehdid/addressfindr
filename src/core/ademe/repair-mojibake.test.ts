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

  // why: l'ancienne version de ce test utilisait "Rue Ã seule" — le marqueur
  // exige un octet de continuation apres le Ã, donc la chaine sortait par la
  // garde d'entree sans jamais atteindre le TextDecoder. La garde fatale, qui
  // est la seule chose empechant de reecrire une adresse non prouvee, n'etait
  // donc pas testee : passer fatal a false laissait la suite verte.
  it('returns the input unchanged when the bytes do not re-read as utf-8', () => {
    // marqueur present (Ã suivi d'un octet de continuation), mais la sequence
    // se termine sur un octet de tete orphelin : UTF-8 invalide.
    const truncated = `Ch${String.fromCharCode(0x00c3, 0x00a2)}teau ${String.fromCharCode(0x00c3)}`;
    expect(truncated).toContain(String.fromCharCode(0x00c3));
    expect(repairMojibake(truncated)).toBe(truncated);
    expect(repairMojibake(truncated)).not.toContain('\uFFFD');
  });

  it('returns the input unchanged when the marker never matches', () => {
    const notMojibake = `Rue ${String.fromCharCode(0x00c3)} seule`;
    expect(repairMojibake(notMojibake)).toBe(notMojibake);
  });

  it('is idempotent', () => {
    const broken = `l${String.fromCharCode(0x00e2, 0x20ac, 0x2122)}Abondance`;
    const once = repairMojibake(broken);
    expect(repairMojibake(once)).toBe(once);
  });
});
