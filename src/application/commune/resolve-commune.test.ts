import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({ NODE_ENV: 'test', VERCEL_ENV: 'development' }),
}));

import type { ICommuneDirectory } from '@/core/commune/ports/commune-directory.port';
import type { Commune, CommuneResolution } from '@/core/commune/types';
import { resolveCommune } from './resolve-commune';

function commune(input: {
  inseeCode: string;
  name: string;
  postalCodes: string[];
  isArrondissement?: boolean;
}): Commune {
  return { isArrondissement: false, ...input };
}

// Values read from geo.api.gouv.fr on 2026-09-28.
const DIRECTORY_COMMUNES: readonly Commune[] = [
  commune({
    inseeCode: '69003',
    name: 'Albigny-sur-Saône',
    postalCodes: ['69250'],
  }),
  commune({
    inseeCode: '69123',
    name: 'Lyon',
    postalCodes: ['69001', '69002', '69003'],
  }),
  commune({
    inseeCode: '69383',
    name: 'Lyon 3e Arrondissement',
    postalCodes: ['69003'],
    isArrondissement: true,
  }),
  commune({ inseeCode: '13008', name: 'Aurons', postalCodes: ['13121'] }),
  commune({
    inseeCode: '13055',
    name: 'Marseille',
    postalCodes: ['13001', '13008'],
  }),
  commune({
    inseeCode: '13208',
    name: 'Marseille 8e Arrondissement',
    postalCodes: ['13008'],
    isArrondissement: true,
  }),
  commune({ inseeCode: '38100', name: 'Le Cheylas', postalCodes: ['38570'] }),
  commune({
    inseeCode: '38185',
    name: 'Grenoble',
    postalCodes: ['38000', '38100'],
  }),
  commune({ inseeCode: '69100', name: 'Irigny', postalCodes: ['69540'] }),
  commune({ inseeCode: '69266', name: 'Villeurbanne', postalCodes: ['69100'] }),
  commune({
    inseeCode: '01001',
    name: "L'Abergement-Clémenciat",
    postalCodes: ['01400'],
  }),
  commune({
    inseeCode: '01093',
    name: 'Châtillon-sur-Chalaronne',
    postalCodes: ['01400'],
  }),
];

const inMemoryDirectory: ICommuneDirectory = {
  findByPostalCode: async ({ postalCode }) =>
    ok(DIRECTORY_COMMUNES.filter((c) => c.postalCodes.includes(postalCode))),
  findByInseeCode: async ({ inseeCode }) =>
    ok(DIRECTORY_COMMUNES.find((c) => c.inseeCode === inseeCode) ?? null),
};

async function resolve(input: {
  inseeCode: string | null;
  inseeCodeOrigin: 'structured' | 'quoted';
  postalCode: string | null;
  city?: string | null;
}): Promise<CommuneResolution> {
  const result = await resolveCommune(
    { city: null, ...input },
    { directory: inMemoryDirectory },
  );
  if (result.isErr()) throw new Error(result.error.message);
  return result.value;
}

function resolvedInsee(resolution: CommuneResolution): string | null {
  return resolution.kind === 'resolved' ? resolution.commune.inseeCode : null;
}

describe('resolveCommune — INSEE code quoted by the model', () => {
  // why: a model asked for the INSEE code can quote a postal code, and a
  // postal code is often also some other commune's INSEE code.
  it.each([
    { quoted: '69003', expected: '69383', wrong: 'Albigny-sur-Saône' },
    { quoted: '13008', expected: '13208', wrong: 'Aurons' },
    { quoted: '38100', expected: '38185', wrong: 'Le Cheylas' },
    { quoted: '69100', expected: '69266', wrong: 'Irigny' },
  ])('ignores $quoted when it resolves to $wrong, outside the listing postal code', async ({
    quoted,
    expected,
  }) => {
    const resolution = await resolve({
      inseeCode: quoted,
      inseeCodeOrigin: 'quoted',
      postalCode: quoted,
    });
    expect(resolvedInsee(resolution)).toBe(expected);
  });

  it('ignores it when the listing has no postal code to confirm it', async () => {
    const resolution = await resolve({
      inseeCode: '69003',
      inseeCodeOrigin: 'quoted',
      postalCode: null,
    });
    expect(resolution).toEqual({ kind: 'unresolved' });
  });

  it('keeps it when its commune contains the listing postal code', async () => {
    const resolution = await resolve({
      inseeCode: '01093',
      inseeCodeOrigin: 'quoted',
      postalCode: '01400',
    });
    expect(resolvedInsee(resolution)).toBe('01093');
  });

  it('keeps an arrondissement code that contains the listing postal code', async () => {
    const resolution = await resolve({
      inseeCode: '69383',
      inseeCodeOrigin: 'quoted',
      postalCode: '69003',
    });
    expect(resolvedInsee(resolution)).toBe('69383');
  });
});

describe('resolveCommune — INSEE code from structured data', () => {
  it('trusts it without a postal code', async () => {
    const resolution = await resolve({
      inseeCode: '01093',
      inseeCodeOrigin: 'structured',
      postalCode: null,
    });
    expect(resolvedInsee(resolution)).toBe('01093');
  });
});

describe('resolveCommune — postal code', () => {
  it('prefers the arrondissement ADEME keys on', async () => {
    const resolution = await resolve({
      inseeCode: null,
      inseeCodeOrigin: 'quoted',
      postalCode: '69003',
    });
    expect(resolvedInsee(resolution)).toBe('69383');
  });

  it('stays ambiguous when the postal code spans several communes', async () => {
    const resolution = await resolve({
      inseeCode: null,
      inseeCodeOrigin: 'quoted',
      postalCode: '01400',
    });
    expect(resolution.kind).toBe('ambiguous');
  });
});
