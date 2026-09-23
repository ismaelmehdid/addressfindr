import { describe, expect, it } from 'vitest';
import { EMPTY_EXTRACTED_VALUES } from '@/core/listing/types';
import { rankCandidates, scoreCandidate } from './score-candidates';
import type { DpeRecord } from './types';

function record(over: Partial<DpeRecord> & { dpeNumber: string }): DpeRecord {
  return {
    dataset: 'existing',
    banId: null,
    address: '16 Rue Lavoisier 69003 Lyon',
    streetNumber: '16',
    street: 'Rue Lavoisier',
    postalCode: '69003',
    city: 'Lyon',
    inseeCode: '69383',
    propertyType: 'apartment',
    surfaceM2: 63,
    dpeClass: 'D',
    gesClass: 'D',
    dpeKwhM2Year: 200,
    gesKgCo2M2Year: 40,
    heatingEnergy: null,
    yearBuilt: 1989,
    floor: 0,
    buildingComplement: null,
    establishedOn: '2026-01-07',
    geocodingScore: 0.7,
    ...over,
  };
}

const LISTING = {
  ...EMPTY_EXTRACTED_VALUES,
  propertyType: 'apartment' as const,
  surfaceM2: 63,
  dpeClass: 'D' as const,
  gesClass: 'D' as const,
  dpeKwhM2Year: 200,
  gesKgCo2M2Year: 40,
  yearBuilt: 1989,
};

describe('scoreCandidate', () => {
  it('gives full confidence when every comparable signal agrees', () => {
    const scored = scoreCandidate({
      values: LISTING,
      record: record({ dpeNumber: 'A' }),
    });
    expect(scored.confidence).toBe(1);
    expect(scored.diverged).toEqual([]);
    expect(scored.matched).toContain('dpeKwhM2Year');
  });

  it('drops confidence when the numeric consumption diverges', () => {
    const scored = scoreCandidate({
      values: LISTING,
      record: record({ dpeNumber: 'A', dpeKwhM2Year: 320 }),
    });
    expect(scored.confidence).toBeLessThan(1);
    expect(scored.diverged).toContain('dpeKwhM2Year');
  });

  it('ignores a signal the listing does not carry', () => {
    const withoutYear = { ...LISTING, yearBuilt: null };
    const scored = scoreCandidate({
      values: withoutYear,
      record: record({ dpeNumber: 'A' }),
    });
    expect(scored.matched).not.toContain('yearBuilt');
    expect(scored.diverged).not.toContain('yearBuilt');
    expect(scored.confidence).toBe(1);
  });

  it('never compares a floor the ADEME row left at its default of zero', () => {
    const scored = scoreCandidate({
      values: { ...LISTING, floor: 2 },
      record: record({ dpeNumber: 'A', floor: 0 }),
    });
    expect(scored.matched).not.toContain('floor');
    expect(scored.diverged).not.toContain('floor');
  });

  it('compares a floor the ADEME row actually states', () => {
    const agree = scoreCandidate({
      values: { ...LISTING, floor: 2 },
      record: record({ dpeNumber: 'A', floor: 2 }),
    });
    expect(agree.matched).toContain('floor');

    const disagree = scoreCandidate({
      values: { ...LISTING, floor: 2 },
      record: record({ dpeNumber: 'A', floor: 5 }),
    });
    expect(disagree.diverged).toContain('floor');
  });

  it('is zero-confidence when nothing at all can be compared', () => {
    const scored = scoreCandidate({
      values: EMPTY_EXTRACTED_VALUES,
      record: record({ dpeNumber: 'A' }),
    });
    expect(scored.confidence).toBe(0);
    expect(scored.matched).toEqual([]);
  });

  it('clamps a heavily contradicted row to zero rather than a negative score', () => {
    const scored = scoreCandidate({
      values: LISTING,
      record: record({
        dpeNumber: 'A',
        dpeClass: 'A',
        gesClass: 'A',
        dpeKwhM2Year: 40,
        gesKgCo2M2Year: 2,
        yearBuilt: 1850,
      }),
    });
    expect(scored.confidence).toBe(0);
  });
});

describe('rankCandidates', () => {
  it('orders by confidence and keeps the divergence visible', () => {
    const ranked = rankCandidates({
      values: LISTING,
      records: [
        record({
          dpeNumber: 'weak',
          address: '1 Rue Faible 69003 Lyon',
          dpeKwhM2Year: 330,
          gesKgCo2M2Year: 90,
        }),
        record({ dpeNumber: 'strong', address: '2 Rue Forte 69003 Lyon' }),
      ],
      truncated: false,
    });

    expect(ranked.candidates.map((c) => c.record.dpeNumber)).toEqual([
      'strong',
      'weak',
    ]);
    expect(ranked.inspected).toBe(2);
    expect(ranked.truncated).toBe(false);
  });

  it('breaks a confidence tie on the geocoding score, then deterministically', () => {
    const ranked = rankCandidates({
      values: LISTING,
      records: [
        record({
          dpeNumber: 'b',
          address: '1 Rue B 69003 Lyon',
          geocodingScore: 0.5,
        }),
        record({
          dpeNumber: 'a',
          address: '2 Rue A 69003 Lyon',
          geocodingScore: 0.9,
        }),
      ],
      truncated: false,
    });
    expect(ranked.candidates[0]?.record.dpeNumber).toBe('a');
  });

  it('collapses many rows at one address into a single answer', () => {
    const records = Array.from({ length: 25 }, (_, i) =>
      record({ dpeNumber: `dpe-${i}` }),
    );
    const ranked = rankCandidates({
      values: LISTING,
      records,
      truncated: true,
    });
    expect(ranked.candidates).toHaveLength(1);
    expect(ranked.candidates[0]?.supportingRecords).toBe(25);
    expect(ranked.inspected).toBe(25);
    expect(ranked.truncated).toBe(true);
  });
});

describe('rankCandidates — regroupement par adresse', () => {
  function atAddress(
    dpeNumber: string,
    banId: string | null,
    over: Partial<DpeRecord> = {},
  ): DpeRecord {
    return record({ dpeNumber, banId, ...over });
  }

  it('renders one candidate per address, not one per DPE row', () => {
    const ranked = rankCandidates({
      values: LISTING,
      records: [
        atAddress('a1', '69383_4180_00016'),
        atAddress('a2', '69383_4180_00016'),
        atAddress('a3', '69383_4180_00016'),
        atAddress('b1', '69383_9999_00002', {
          address: '5 Rue Autre 69003 Lyon',
        }),
      ],
      truncated: false,
    });

    expect(ranked.candidates).toHaveLength(2);
    expect(ranked.inspected).toBe(4);
  });

  it('counts the rows backing each address', () => {
    const ranked = rankCandidates({
      values: LISTING,
      records: [
        atAddress('a1', '69383_4180_00016'),
        atAddress('a2', '69383_4180_00016'),
        atAddress('a3', '69383_4180_00016'),
        atAddress('b1', '69383_9999_00002', {
          address: '5 Rue Autre 69003 Lyon',
        }),
      ],
      truncated: false,
    });

    const byAddress = new Map(
      ranked.candidates.map((c) => [c.record.address, c.supportingRecords]),
    );
    expect(byAddress.get('16 Rue Lavoisier 69003 Lyon')).toBe(3);
    expect(byAddress.get('5 Rue Autre 69003 Lyon')).toBe(1);
  });

  it('keeps the best-scoring row as the face of its address', () => {
    const ranked = rankCandidates({
      values: LISTING,
      records: [
        atAddress('weak', '69383_4180_00016', { dpeKwhM2Year: 320 }),
        atAddress('strong', '69383_4180_00016'),
      ],
      truncated: false,
    });

    expect(ranked.candidates).toHaveLength(1);
    expect(ranked.candidates[0]?.record.dpeNumber).toBe('strong');
    expect(ranked.candidates[0]?.confidence).toBe(1);
  });

  it('groups two spellings of one address that share a BAN identifier', () => {
    const ranked = rankCandidates({
      values: LISTING,
      records: [
        atAddress('a1', '69383_4180_00016', {
          address: "17 Rue de l'Abondance 69003 Lyon",
        }),
        atAddress('a2', '69383_4180_00016', {
          address: `17 Rue de l${String.fromCharCode(0x2019)}Abondance 69003 LYON`,
        }),
      ],
      truncated: false,
    });

    expect(ranked.candidates).toHaveLength(1);
    expect(ranked.candidates[0]?.supportingRecords).toBe(2);
  });

  it('groups rows with no BAN identifier on their normalised address', () => {
    const ranked = rankCandidates({
      values: LISTING,
      records: [
        atAddress('a1', null, { address: '16 Rue Lavoisier 69003 Lyon' }),
        atAddress('a2', null, { address: '16 RUE LAVOISIER, 69003 lyon' }),
      ],
      truncated: false,
    });

    expect(ranked.candidates).toHaveLength(1);
    expect(ranked.candidates[0]?.supportingRecords).toBe(2);
  });

  // why: le nombre de lignes d'appui n'est pas encore calibre contre une verite
  // terrain, donc il departage seulement. Il ne doit jamais remonter une adresse
  // moins bien notee au-dessus d'une mieux notee.
  it('never lets the support count outrank a better-scoring address', () => {
    const ranked = rankCandidates({
      values: LISTING,
      records: [
        atAddress('m1', '69383_1111_00001', {
          address: '1 Rue Nombreuse 69003 Lyon',
          dpeKwhM2Year: 320,
        }),
        atAddress('m2', '69383_1111_00001', {
          address: '1 Rue Nombreuse 69003 Lyon',
          dpeKwhM2Year: 320,
        }),
        atAddress('m3', '69383_1111_00001', {
          address: '1 Rue Nombreuse 69003 Lyon',
          dpeKwhM2Year: 320,
        }),
        atAddress('s1', '69383_2222_00002', {
          address: '2 Rue Unique 69003 Lyon',
        }),
      ],
      truncated: false,
    });

    expect(ranked.candidates[0]?.record.address).toBe(
      '2 Rue Unique 69003 Lyon',
    );
  });

  it('breaks a tie between two equally scored addresses on the support count', () => {
    const ranked = rankCandidates({
      values: LISTING,
      records: [
        atAddress('lonely', '69383_2222_00002', {
          address: '2 Rue Unique 69003 Lyon',
          geocodingScore: 0.7,
        }),
        atAddress('busy1', '69383_1111_00001', {
          address: '1 Rue Nombreuse 69003 Lyon',
          geocodingScore: 0.7,
        }),
        atAddress('busy2', '69383_1111_00001', {
          address: '1 Rue Nombreuse 69003 Lyon',
          geocodingScore: 0.7,
        }),
      ],
      truncated: false,
    });

    expect(ranked.candidates[0]?.record.address).toBe(
      '1 Rue Nombreuse 69003 Lyon',
    );
    expect(ranked.candidates[0]?.supportingRecords).toBe(2);
  });

  it('caps the shortlist on distinct addresses', () => {
    const records = Array.from({ length: 25 }, (_, i) =>
      atAddress(`dpe-${i}`, `69383_0000_${String(i).padStart(5, '0')}`, {
        address: `${i} Rue Numerotee 69003 Lyon`,
      }),
    );
    const ranked = rankCandidates({
      values: LISTING,
      records,
      truncated: false,
    });
    expect(ranked.candidates).toHaveLength(10);
    expect(ranked.inspected).toBe(25);
  });
});

describe('scoreCandidate — energie de chauffage', () => {
  it('credits a heating energy both sides agree on', () => {
    const scored = scoreCandidate({
      values: { ...LISTING, heatingEnergy: 'gas' },
      record: record({ dpeNumber: 'A', heatingEnergy: 'gas' }),
    });
    expect(scored.matched).toContain('heatingEnergy');
    expect(scored.confidence).toBe(1);
  });

  it('penalises a heating energy the two sides disagree on', () => {
    const scored = scoreCandidate({
      values: { ...LISTING, heatingEnergy: 'gas' },
      record: record({ dpeNumber: 'A', heatingEnergy: 'electricity' }),
    });
    expect(scored.diverged).toContain('heatingEnergy');
    expect(scored.confidence).toBeLessThan(1);
  });

  it('ignores the signal when the listing never stated one', () => {
    const scored = scoreCandidate({
      values: { ...LISTING, heatingEnergy: null },
      record: record({ dpeNumber: 'A', heatingEnergy: 'gas' }),
    });
    expect(scored.matched).not.toContain('heatingEnergy');
    expect(scored.diverged).not.toContain('heatingEnergy');
    expect(scored.confidence).toBe(1);
  });

  it('ignores the signal when the ADEME row never stated one', () => {
    const scored = scoreCandidate({
      values: { ...LISTING, heatingEnergy: 'gas' },
      record: record({ dpeNumber: 'A', heatingEnergy: null }),
    });
    expect(scored.matched).not.toContain('heatingEnergy');
    expect(scored.diverged).not.toContain('heatingEnergy');
  });

  it('separates a gas row from an electric row on that signal alone', () => {
    const values = { ...LISTING, heatingEnergy: 'gas' as const };
    const gas = scoreCandidate({
      values,
      record: record({ dpeNumber: 'gas', heatingEnergy: 'gas' }),
    });
    const electric = scoreCandidate({
      values,
      record: record({ dpeNumber: 'elec', heatingEnergy: 'electricity' }),
    });
    expect(gas.confidence).toBeGreaterThan(electric.confidence);
  });
});

describe('scoreCandidate — qualite du geocodage', () => {
  // why: score_ban dit a quel point l'ADEME est sure d'avoir rattache la ligne
  // a cette adresse. Mesure du 2026-09-22 : 372 lignes sur 34045 sont sous 0.5
  // a Lyon 3e. Une ligne mal geocodee peut correspondre parfaitement au
  // logement et pointer la mauvaise adresse — c'est exactement l'erreur qui
  // coute le plus cher.
  it('caps confidence on a doubtfully geocoded row', () => {
    const scored = scoreCandidate({
      values: LISTING,
      record: record({ dpeNumber: 'A', geocodingScore: 0.3 }),
    });
    expect(scored.confidence).toBeLessThan(1);
    expect(scored.confidence).toBeGreaterThan(0);
  });

  it('leaves a well geocoded row untouched', () => {
    const scored = scoreCandidate({
      values: LISTING,
      record: record({ dpeNumber: 'A', geocodingScore: 0.9 }),
    });
    expect(scored.confidence).toBe(1);
  });

  it('leaves a mid-range geocoding untouched', () => {
    const scored = scoreCandidate({
      values: LISTING,
      record: record({ dpeNumber: 'A', geocodingScore: 0.62 }),
    });
    expect(scored.confidence).toBe(1);
  });

  it('does not penalise a row that reports no geocoding score', () => {
    const scored = scoreCandidate({
      values: LISTING,
      record: record({ dpeNumber: 'A', geocodingScore: null }),
    });
    expect(scored.confidence).toBe(1);
  });

  it('ranks a well geocoded row above an identically scored doubtful one', () => {
    const ranked = rankCandidates({
      values: LISTING,
      records: [
        record({
          dpeNumber: 'doubtful',
          address: '1 Rue Douteuse 69003 Lyon',
          geocodingScore: 0.2,
        }),
        record({
          dpeNumber: 'sure',
          address: '2 Rue Sure 69003 Lyon',
          geocodingScore: 0.9,
        }),
      ],
      truncated: false,
    });
    expect(ranked.candidates[0]?.record.address).toBe('2 Rue Sure 69003 Lyon');
  });

  it('never drives a fully agreeing row to zero on geocoding alone', () => {
    const scored = scoreCandidate({
      values: LISTING,
      record: record({ dpeNumber: 'A', geocodingScore: 0 }),
    });
    expect(scored.confidence).toBeGreaterThan(0.5);
  });
});

describe('rankCandidates — refus faute de preuve', () => {
  // why: mesure du 2026-09-22. Sur pap.fr, l'extraction ne rend que commune,
  // type et surface : le portail n'affiche pas le DPE. Le filtre laisse alors
  // des milliers de lignes, chacune ne se comparant que sur la surface, donc
  // chacune sortant a 100%. Dix adresses affichees comme certaines alors que
  // rien ne les distingue, c'est exactement l'erreur que le produit interdit.
  const SURFACE_ONLY = {
    ...EMPTY_EXTRACTED_VALUES,
    propertyType: 'apartment' as const,
    surfaceM2: 63,
  };

  it('returns nothing when the surface is the only comparable signal', () => {
    const ranked = rankCandidates({
      values: SURFACE_ONLY,
      records: [
        record({ dpeNumber: 'a', address: '1 Rue A 69003 Lyon' }),
        record({ dpeNumber: 'b', address: '2 Rue B 69003 Lyon' }),
      ],
      truncated: false,
    });

    expect(ranked.candidates).toEqual([]);
    expect(ranked.refusedFor).toBe('insufficient-evidence');
    expect(ranked.inspected).toBe(2);
  });

  // why: dpeClass ne compte pas — la recherche l'a deja pose en filtre exact,
  // donc toute ligne rendue porte la meme lettre. gesClass n'est jamais filtre.
  it('answers as soon as one discriminating signal is comparable', () => {
    const ranked = rankCandidates({
      values: { ...SURFACE_ONLY, gesClass: 'D' },
      records: [
        record({
          dpeNumber: 'a',
          address: '1 Rue A 69003 Lyon',
          gesClass: 'D',
        }),
      ],
      truncated: false,
    });

    expect(ranked.candidates).toHaveLength(1);
    expect(ranked.refusedFor).toBeNull();
  });

  it('counts the heating energy as discriminating', () => {
    const ranked = rankCandidates({
      values: { ...SURFACE_ONLY, heatingEnergy: 'gas' },
      records: [
        record({
          dpeNumber: 'a',
          address: '1 Rue A 69003 Lyon',
          heatingEnergy: 'gas',
        }),
      ],
      truncated: false,
    });
    expect(ranked.refusedFor).toBeNull();
  });

  // why: un signal que l'annonce porte mais que la ligne ADEME n'a pas n'est
  // pas une preuve. Sinon il suffirait qu'une annonce mentionne son etage pour
  // debloquer une reponse que rien ne soutient cote registre.
  it('does not count a signal the ADEME row cannot answer', () => {
    const ranked = rankCandidates({
      values: { ...SURFACE_ONLY, yearBuilt: 1970 },
      records: [
        record({
          dpeNumber: 'a',
          address: '1 Rue A 69003 Lyon',
          yearBuilt: null,
        }),
      ],
      truncated: false,
    });
    expect(ranked.candidates).toEqual([]);
    expect(ranked.refusedFor).toBe('insufficient-evidence');
  });

  it('still reports how much it looked at when it refuses', () => {
    const ranked = rankCandidates({
      values: SURFACE_ONLY,
      records: [record({ dpeNumber: 'a' })],
      truncated: true,
    });
    expect(ranked.inspected).toBe(1);
    expect(ranked.truncated).toBe(true);
  });

  it('refuses on an empty record set without inventing a reason', () => {
    const ranked = rankCandidates({
      values: { ...SURFACE_ONLY, dpeClass: 'D' },
      records: [],
      truncated: false,
    });
    expect(ranked.candidates).toEqual([]);
    expect(ranked.refusedFor).toBeNull();
  });
});

describe('rankCandidates — defauts trouves en revue adversariale', () => {
  const SURFACE_ONLY = {
    ...EMPTY_EXTRACTED_VALUES,
    propertyType: 'apartment' as const,
    surfaceM2: 63,
  };

  // why: buildDpeSearch met dpeClass dans le filtre et l'adaptateur en fait la
  // clause exacte etiquette_dpe:"D". Toute ligne qui revient porte donc la meme
  // lettre : elle ne separe rien, exactement comme la surface. Pire, la surface
  // est un filtre d'intervalle — les lignes en different — la lettre est un
  // filtre exact. Le signal exclu discriminait plus que le signal inclus.
  it('refuses when the DPE letter is the only thing beyond the surface', () => {
    const ranked = rankCandidates({
      values: { ...SURFACE_ONLY, dpeClass: 'D' },
      records: Array.from({ length: 12 }, (_, i) =>
        record({
          dpeNumber: `d-${i}`,
          address: `${i} Rue Identique 69003 Lyon`,
          banId: `69383_0001_${String(i).padStart(5, '0')}`,
          dpeClass: 'D',
          gesClass: null,
          dpeKwhM2Year: null,
          gesKgCo2M2Year: null,
          yearBuilt: null,
        }),
      ),
      truncated: false,
    });

    expect(ranked.candidates).toEqual([]);
    expect(ranked.refusedFor).toBe('insufficient-evidence');
  });

  it('still answers when the GES letter is present, which the search never filters on', () => {
    const ranked = rankCandidates({
      values: { ...SURFACE_ONLY, dpeClass: 'D', gesClass: 'D' },
      records: [record({ dpeNumber: 'a', dpeClass: 'D', gesClass: 'D' })],
      truncated: false,
    });
    expect(ranked.refusedFor).toBeNull();
    expect(ranked.candidates).toHaveLength(1);
  });

  // why: la porte se decidait sur toute la population avant la coupe a dix.
  // Une seule ligne enfouie au rang 500 debloquait donc une liste de dix
  // adresses dont aucune ne portait la moindre preuve.
  it('decides the gate on the shortlist it actually returns', () => {
    const mute = Array.from({ length: 11 }, (_, i) =>
      record({
        dpeNumber: `mute-${i}`,
        address: `${i} Rue Muette 69003 Lyon`,
        banId: `69383_0002_${String(i).padStart(5, '0')}`,
        yearBuilt: null,
        gesClass: null,
        dpeKwhM2Year: null,
        gesKgCo2M2Year: null,
      }),
    );
    const speaking = record({
      dpeNumber: 'zzz-speaking',
      address: '99 Rue Parlante 69003 Lyon',
      banId: '69383_0003_00099',
      yearBuilt: 1989,
      gesClass: null,
      dpeKwhM2Year: null,
      gesKgCo2M2Year: null,
    });

    const ranked = rankCandidates({
      values: { ...SURFACE_ONLY, yearBuilt: 1989 },
      records: [...mute, speaking],
      truncated: false,
    });

    const returnedHaveEvidence = ranked.candidates.every((c) =>
      [...c.matched, ...c.diverged].some((s) => s !== 'surfaceM2'),
    );
    expect(
      ranked.refusedFor === 'insufficient-evidence' || returnedHaveEvidence,
    ).toBe(true);
  });

  // why: un appui est une ligne qui confirme, pas une ligne qui contredit.
  // Compter les contradictions faisait remonter une adresse au rang 1 grace
  // aux lignes qui la refutaient.
  it('does not count a contradicting row as support', () => {
    const ranked = rankCandidates({
      values: { ...SURFACE_ONLY, gesClass: 'D' },
      records: [
        record({
          dpeNumber: 'agree',
          address: '1 Rue Contredite 69003 Lyon',
          banId: '69383_0004_00001',
          gesClass: 'D',
        }),
        record({
          dpeNumber: 'contradict-1',
          address: '1 Rue Contredite 69003 Lyon',
          banId: '69383_0004_00001',
          gesClass: 'A',
        }),
        record({
          dpeNumber: 'contradict-2',
          address: '1 Rue Contredite 69003 Lyon',
          banId: '69383_0004_00001',
          gesClass: 'A',
        }),
      ],
      truncated: false,
    });

    expect(ranked.candidates[0]?.supportingRecords).toBe(1);
  });

  it('does not let contradicting rows outrank a cleanly supported address', () => {
    const ranked = rankCandidates({
      values: { ...SURFACE_ONLY, gesClass: 'D' },
      records: [
        ...Array.from({ length: 3 }, (_, i) =>
          record({
            dpeNumber: `noisy-${i}`,
            address: '1 Rue Bruyante 69003 Lyon',
            banId: '69383_0005_00001',
            gesClass: i === 0 ? 'D' : 'A',
            geocodingScore: 0.7,
          }),
        ),
        record({
          dpeNumber: 'clean-1',
          address: '2 Rue Nette 69003 Lyon',
          banId: '69383_0006_00002',
          gesClass: 'D',
          geocodingScore: 0.7,
        }),
        record({
          dpeNumber: 'clean-2',
          address: '2 Rue Nette 69003 Lyon',
          banId: '69383_0006_00002',
          gesClass: 'D',
          geocodingScore: 0.7,
        }),
      ],
      truncated: false,
    });

    expect(ranked.candidates[0]?.record.address).toBe('2 Rue Nette 69003 Lyon');
    expect(ranked.candidates[0]?.supportingRecords).toBe(2);
  });
});
