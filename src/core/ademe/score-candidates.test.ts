import { describe, expect, it } from 'vitest';
import { EMPTY_EXTRACTED_VALUES } from '@/core/listing/types';
import {
  admitsOutsideCommune,
  rankCandidates,
  scoreCandidate,
} from './score-candidates';
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
    landSurfaceM2: null,
    buildingFloors: null,
    floor: 0,
    buildingComplement: null,
    establishedOn: '2026-01-07',
    visitedOn: '2026-01-06',
    annualEnergyCostEur: null,
    geocodingScore: 0.7,
    point: null,
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

describe('scoreCandidate — surface de terrain', () => {
  const HOUSE = {
    ...EMPTY_EXTRACTED_VALUES,
    propertyType: 'house' as const,
    surfaceM2: 120,
    gesClass: 'D' as const,
    landSurfaceM2: 1200,
  };

  it('credits a plot area both sides agree on', () => {
    const scored = scoreCandidate({
      values: HOUSE,
      record: record({
        dpeNumber: 'a',
        propertyType: 'house',
        surfaceM2: 120,
        landSurfaceM2: 1230,
      }),
    });
    expect(scored.matched).toContain('landSurfaceM2');
  });

  it('penalises a plot area that is plainly different', () => {
    const scored = scoreCandidate({
      values: HOUSE,
      record: record({
        dpeNumber: 'a',
        propertyType: 'house',
        surfaceM2: 120,
        landSurfaceM2: 300,
      }),
    });
    expect(scored.diverged).toContain('landSurfaceM2');
  });

  // why: un appartement n'a pas de terrain. La parcelle porte tout l'immeuble,
  // donc la comparer a ce qu'annonce un lot serait une erreur garantie.
  it('never compares a plot area on an apartment', () => {
    const scored = scoreCandidate({
      values: { ...HOUSE, propertyType: 'apartment' },
      record: record({
        dpeNumber: 'a',
        propertyType: 'apartment',
        landSurfaceM2: 300,
      }),
    });
    expect(scored.matched).not.toContain('landSurfaceM2');
    expect(scored.diverged).not.toContain('landSurfaceM2');
  });

  it('ignores the signal when the cadastre gave nothing', () => {
    const scored = scoreCandidate({
      values: HOUSE,
      record: record({
        dpeNumber: 'a',
        propertyType: 'house',
        surfaceM2: 120,
        landSurfaceM2: null,
      }),
    });
    expect(scored.matched).not.toContain('landSurfaceM2');
    expect(scored.diverged).not.toContain('landSurfaceM2');
  });
});

describe('scoreCandidate — echelle de la surface', () => {
  // why: tous les tests de ce fichier comparaient 63 a 63, donc seul le
  // premier palier etait exerce. Les deux autres etaient morts sous test, y
  // compris l'invariant que le commentaire du code enonce : un ecart residuel
  // rapporte moins, jamais moins que rien. Passer le repli de 1 a -3 laissait
  // la suite verte, et l'interface se mettait alors a annoncer une divergence
  // de surface sur la bonne ligne.
  function confidenceAtSurface(recordSurface: number): number {
    return scoreCandidate({
      values: { ...LISTING, surfaceM2: 63 },
      record: record({ dpeNumber: 'a', surfaceM2: recordSurface }),
    }).confidence;
  }

  it('credits an exact surface most', () => {
    expect(confidenceAtSurface(63)).toBe(1);
  });

  it('credits a near surface less, but still credits it', () => {
    const near = scoreCandidate({
      values: { ...LISTING, surfaceM2: 63 },
      record: record({ dpeNumber: 'a', surfaceM2: 64 }),
    });
    expect(near.matched).toContain('surfaceM2');
    expect(near.confidence).toBeLessThan(1);
    expect(near.confidence).toBeGreaterThan(0.8);
  });

  it('still credits a surface at the far edge of the search window', () => {
    const far = scoreCandidate({
      values: { ...LISTING, surfaceM2: 63 },
      record: record({ dpeNumber: 'a', surfaceM2: 61 }),
    });
    expect(far.matched).toContain('surfaceM2');
    expect(far.diverged).not.toContain('surfaceM2');
    expect(far.confidence).toBeGreaterThan(0.8);
  });

  it('orders the three surface tiers', () => {
    expect(confidenceAtSurface(63)).toBeGreaterThan(confidenceAtSurface(64));
    expect(confidenceAtSurface(64)).toBeGreaterThan(confidenceAtSurface(61));
  });
});

describe('rankCandidates — le departage par geocodage est bien celui qui joue', () => {
  // why: l'ancien test nommait la ligne bien geocodee 'a' et l'autre 'b', or
  // le dernier cran du comparateur trie par numero de DPE — 'a' sortait
  // premier meme sans le cran geocodage. Les noms sont donc inverses pour que
  // seul le geocodage puisse produire l'ordre attendu.
  it('prefers the better geocoded address when confidences are equal', () => {
    const ranked = rankCandidates({
      values: LISTING,
      records: [
        record({
          dpeNumber: 'aaa-mal-geocode',
          address: '1 Rue Mal Geocodee 69003 Lyon',
          banId: '69383_1000_00001',
          geocodingScore: 0.55,
        }),
        record({
          dpeNumber: 'zzz-bien-geocode',
          address: '2 Rue Bien Geocodee 69003 Lyon',
          banId: '69383_1000_00002',
          geocodingScore: 0.95,
        }),
      ],
      truncated: false,
    });

    expect(ranked.candidates[0]?.confidence).toBe(
      ranked.candidates[1]?.confidence,
    );
    expect(ranked.candidates[0]?.record.dpeNumber).toBe('zzz-bien-geocode');
  });
});

describe('scoreCandidate — annual energy cost and DPE date', () => {
  // why: measured 2026-09-24 against precisement.fr on leboncoin listings.
  // The midpoint of the cost range printed on the label lands within 0.5 % of
  // ADEME's cout_total_5_usages on the four rows they designate (1540 against
  // 1536.4, 720 against 719.5), and the DPE date the listing quotes is ADEME's
  // to the day.
  const WITH_EVIDENCE = {
    ...LISTING,
    annualEnergyCostMinEur: 1290,
    annualEnergyCostMaxEur: 1790,
    dpeDate: '2022-04-14',
  };

  it('credits an energy cost the label range is centred on', () => {
    const scored = scoreCandidate({
      values: WITH_EVIDENCE,
      record: record({ dpeNumber: 'A', annualEnergyCostEur: 1536.4 }),
    });
    expect(scored.matched).toContain('annualEnergyCost');
  });

  it('penalises an energy cost far from the label range', () => {
    const scored = scoreCandidate({
      values: WITH_EVIDENCE,
      record: record({ dpeNumber: 'A', annualEnergyCostEur: 1000 }),
    });
    expect(scored.diverged).toContain('annualEnergyCost');
  });

  it('never compares an energy cost from a single bound', () => {
    const scored = scoreCandidate({
      values: { ...WITH_EVIDENCE, annualEnergyCostMaxEur: null },
      record: record({ dpeNumber: 'A', annualEnergyCostEur: 1000 }),
    });
    expect(scored.matched).not.toContain('annualEnergyCost');
    expect(scored.diverged).not.toContain('annualEnergyCost');
  });

  it('credits a DPE date equal to the establishment date', () => {
    const scored = scoreCandidate({
      values: WITH_EVIDENCE,
      record: record({ dpeNumber: 'A', establishedOn: '2022-04-14' }),
    });
    expect(scored.matched).toContain('dpeDate');
  });

  it('credits a DPE date equal to the visit date', () => {
    const scored = scoreCandidate({
      values: WITH_EVIDENCE,
      record: record({
        dpeNumber: 'A',
        visitedOn: '2022-04-14',
        establishedOn: '2022-04-15',
      }),
    });
    expect(scored.matched).toContain('dpeDate');
  });

  it('penalises a DPE issued on another day', () => {
    const scored = scoreCandidate({
      values: WITH_EVIDENCE,
      record: record({
        dpeNumber: 'A',
        visitedOn: '2023-11-02',
        establishedOn: '2023-11-02',
      }),
    });
    expect(scored.diverged).toContain('dpeDate');
  });

  // why: the DPE registers start on 2021-07-01. A listing quoting an older
  // diagnostic (measured 2026-09-24: "05/09/2018" on a Nantes listing) points
  // at a DPE no row can carry, so the date says nothing about any row.
  it('never compares a DPE date older than the registers', () => {
    const scored = scoreCandidate({
      values: { ...WITH_EVIDENCE, dpeDate: '2018-09-05' },
      record: record({ dpeNumber: 'A' }),
    });
    expect(scored.matched).not.toContain('dpeDate');
    expect(scored.diverged).not.toContain('dpeDate');
  });

  it('ranks the row the date and the cost designate above a closer surface', () => {
    const ranked = rankCandidates({
      values: { ...WITH_EVIDENCE, surfaceM2: 150, dpeKwhM2Year: null },
      records: [
        record({
          dpeNumber: 'closer-surface',
          address: '22 Rue Antoine Dumont 69008 Lyon',
          surfaceM2: 148,
          annualEnergyCostEur: 1210,
          establishedOn: '2023-02-01',
          visitedOn: '2023-02-01',
        }),
        record({
          dpeNumber: 'designated',
          address: '47 Rue Victor et Roger Thomas 69008 Lyon',
          surfaceM2: 133.8,
          annualEnergyCostEur: 1536.4,
          establishedOn: '2022-04-14',
          visitedOn: '2022-04-14',
        }),
      ],
      truncated: false,
    });
    expect(ranked.candidates[0]?.record.dpeNumber).toBe('designated');
  });

  it('answers on the DPE date alone', () => {
    const ranked = rankCandidates({
      values: {
        ...EMPTY_EXTRACTED_VALUES,
        propertyType: 'apartment',
        surfaceM2: 63,
        dpeClass: 'D',
        dpeDate: '2026-01-06',
      },
      records: [record({ dpeNumber: 'A', gesClass: null })],
      truncated: false,
    });
    expect(ranked.refusedFor).toBeNull();
    expect(ranked.candidates[0]?.matched).toContain('dpeDate');
  });
});

describe('scoreCandidate — minimum evidence', () => {
  // why: measured 2026-09-24, 17 leboncoin listings out of 25 returned an
  // address at 100 % on the surface and both letters alone, which hundreds of
  // rows share. Full agreement on so little must not read as certainty.
  it('never reads full confidence on the surface and the letters alone', () => {
    const scored = scoreCandidate({
      values: {
        ...EMPTY_EXTRACTED_VALUES,
        propertyType: 'apartment',
        surfaceM2: 63,
        dpeClass: 'D',
        gesClass: 'D',
      },
      record: record({ dpeNumber: 'A' }),
    });
    expect(scored.diverged).toEqual([]);
    expect(scored.confidence).toBeLessThan(0.6);
  });
});

describe('scoreCandidate — surface inside the widened window', () => {
  // why: measured 2026-09-24, the row precisement.fr designates sits up to
  // 11 % away from the listed surface (133.8 for 150 m2, 110 for 123): the
  // listing counts annexes ADEME leaves out of the living area.
  it('credits a surface 11 % away weakly, never as a divergence', () => {
    const far = scoreCandidate({
      values: { ...LISTING, surfaceM2: 150 },
      record: record({ dpeNumber: 'a', surfaceM2: 133.8 }),
    });
    const near = scoreCandidate({
      values: { ...LISTING, surfaceM2: 150 },
      record: record({ dpeNumber: 'b', surfaceM2: 148 }),
    });
    expect(far.matched).toContain('surfaceM2');
    expect(far.confidence).toBeLessThan(near.confidence);
  });
});

describe('admitsOutsideCommune', () => {
  // why: measured 2026-09-24, a leboncoin listing labelled "Rennes" describes
  // a house in Melesse; precisement.fr found it outside the stated commune.
  // A row from another commune has none of the commune's implicit support,
  // so it must carry the exact DPE date and a printed label number, and
  // contradict nothing.
  const LISTED = {
    ...LISTING,
    dpeDate: '2026-09-17',
    annualEnergyCostMinEur: 1070,
    annualEnergyCostMaxEur: 1490,
  };

  it('admits a row that matches the date and a label number', () => {
    expect(
      admitsOutsideCommune({
        values: LISTED,
        record: record({
          dpeNumber: 'A',
          establishedOn: '2026-09-17',
          annualEnergyCostEur: 1278.2,
        }),
      }),
    ).toBe(true);
  });

  it('refuses a row whose DPE date is only near the listed one', () => {
    expect(
      admitsOutsideCommune({
        values: LISTED,
        record: record({
          dpeNumber: 'A',
          establishedOn: '2026-09-16',
          visitedOn: '2026-09-16',
          annualEnergyCostEur: 1278.2,
        }),
      }),
    ).toBe(false);
  });

  it('refuses a row that matches the date alone', () => {
    expect(
      admitsOutsideCommune({
        values: { ...LISTED, dpeKwhM2Year: null, gesKgCo2M2Year: null },
        record: record({ dpeNumber: 'A', establishedOn: '2026-09-17' }),
      }),
    ).toBe(false);
  });

  it('refuses a row that contradicts any signal', () => {
    expect(
      admitsOutsideCommune({
        values: LISTED,
        record: record({
          dpeNumber: 'A',
          establishedOn: '2026-09-17',
          annualEnergyCostEur: 1278.2,
          yearBuilt: 1950,
        }),
      }),
    ).toBe(false);
  });
});

describe('scoreCandidate — listing map pin', () => {
  // why: measured 2026-09-24 on leboncoin, a pin placed from a typed address
  // sat 3 m, 13 m and 94 m from the row precisement.fr designates, and up to
  // 1 km on an ambiguous listing. Close is strong evidence, far is weak doubt.
  const PINNED = {
    ...LISTING,
    pin: { latitude: 47.21559, longitude: -1.55507 },
  };

  it('credits a row a few metres from the pin', () => {
    const scored = scoreCandidate({
      values: PINNED,
      record: record({
        dpeNumber: 'A',
        point: { latitude: 47.21561, longitude: -1.55509 },
      }),
    });
    expect(scored.matched).toContain('pinDistance');
  });

  it('doubts a row far from the pin', () => {
    const scored = scoreCandidate({
      values: PINNED,
      record: record({
        dpeNumber: 'A',
        point: { latitude: 47.23, longitude: -1.58 },
      }),
    });
    expect(scored.diverged).toContain('pinDistance');
  });

  it('ignores the pin when the row has no trusted point', () => {
    const scored = scoreCandidate({
      values: PINNED,
      record: record({ dpeNumber: 'A', point: null }),
    });
    expect(scored.matched).not.toContain('pinDistance');
    expect(scored.diverged).not.toContain('pinDistance');
  });

  it('ranks the row under the pin first when the label numbers tie', () => {
    const ranked = rankCandidates({
      values: PINNED,
      records: [
        record({
          dpeNumber: 'aaa-far',
          address: '9 Rue Racine 44000 Nantes',
          point: { latitude: 47.2135, longitude: -1.5631 },
        }),
        record({
          dpeNumber: 'zzz-under-pin',
          address: '5 Place du Change 44000 Nantes',
          point: { latitude: 47.21561, longitude: -1.55509 },
        }),
      ],
      truncated: false,
    });
    expect(ranked.candidates[0]?.record.dpeNumber).toBe('zzz-under-pin');
  });
});
