import type { HeatingEnergy } from '@/core/listing/types';

// why: vocabulaire releve sur le registre ADEME le 2026-09-22 via
// /values/type_energie_principale_chauffage. "Non affecte" signifie non
// renseigne, et le reseau de froid n'est pas un chauffage : les deux restent
// nuls plutot que de produire un accord invente.
const ADEME_HEATING_ENERGIES: Record<string, HeatingEnergy> = {
  'gaz naturel': 'gas',
  électricité: 'electricity',
  "électricité d'origine renouvelable utilisée dans le bâtiment": 'electricity',
  'réseau de chauffage urbain': 'district-heating',
  'fioul domestique': 'fuel-oil',
  'bois – bûches': 'wood',
  'bois – granulés (pellets) ou briquettes': 'wood',
  'bois – plaquettes d’industrie': 'wood',
  'bois – plaquettes forestières': 'wood',
  butane: 'lpg',
  propane: 'lpg',
  gpl: 'lpg',
  charbon: 'coal',
};

export function toHeatingEnergy(
  raw: string | null | undefined,
): HeatingEnergy | null {
  if (typeof raw !== 'string') return null;
  return ADEME_HEATING_ENERGIES[raw.trim().toLowerCase()] ?? null;
}
