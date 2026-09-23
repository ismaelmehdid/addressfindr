import { describe, expect, it } from 'vitest';
import { toHeatingEnergy } from './heating-energy';

describe('toHeatingEnergy', () => {
  it('maps every value the ADEME register actually uses', () => {
    const ademeVocabulary = {
      'Gaz naturel': 'gas',
      Électricité: 'electricity',
      "Électricité d'origine renouvelable utilisée dans le bâtiment":
        'electricity',
      'Réseau de Chauffage urbain': 'district-heating',
      'Fioul domestique': 'fuel-oil',
      'Bois – Bûches': 'wood',
      'Bois – Granulés (pellets) ou briquettes': 'wood',
      'Bois – Plaquettes d’industrie': 'wood',
      'Bois – Plaquettes forestières': 'wood',
      Butane: 'lpg',
      Propane: 'lpg',
      GPL: 'lpg',
      Charbon: 'coal',
    } as const;

    for (const [raw, expected] of Object.entries(ademeVocabulary)) {
      expect(toHeatingEnergy(raw), raw).toBe(expected);
    }
  });

  // why: "Non affecte" veut dire non renseigne, et le reseau de froid n'est pas
  // un chauffage. Les deux doivent rester nuls plutot que d'inventer un accord.
  it('leaves the non-answers null', () => {
    expect(toHeatingEnergy('Non affecté')).toBeNull();
    expect(toHeatingEnergy('Réseau de Froid Urbain')).toBeNull();
    expect(toHeatingEnergy('')).toBeNull();
    expect(toHeatingEnergy(null)).toBeNull();
    expect(toHeatingEnergy('Quelque chose de nouveau')).toBeNull();
  });
});
