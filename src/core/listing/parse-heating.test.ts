import { describe, expect, it } from 'vitest';
import { parseHeatingEnergy } from './parse-values';

describe('parseHeatingEnergy', () => {
  it('reads the common French phrasings for gas', () => {
    expect(parseHeatingEnergy('Chauffage individuel gaz')).toBe('gas');
    expect(parseHeatingEnergy('chauffage collectif au gaz naturel')).toBe(
      'gas',
    );
  });

  it('reads electric heating', () => {
    expect(parseHeatingEnergy('Chauffage électrique')).toBe('electricity');
    expect(parseHeatingEnergy('chauffage individuel electrique')).toBe(
      'electricity',
    );
  });

  it('reads district heating', () => {
    expect(parseHeatingEnergy('Chauffage urbain')).toBe('district-heating');
    expect(parseHeatingEnergy('réseau de chaleur')).toBe('district-heating');
  });

  it('reads fuel oil, wood, LPG and coal', () => {
    expect(parseHeatingEnergy('chauffage au fioul')).toBe('fuel-oil');
    expect(parseHeatingEnergy('chauffage au mazout')).toBe('fuel-oil');
    expect(parseHeatingEnergy('poêle à granulés bois')).toBe('wood');
    expect(parseHeatingEnergy('chauffage au propane')).toBe('lpg');
    expect(parseHeatingEnergy('chaudière au charbon')).toBe('coal');
  });

  // why: la pompe a chaleur consomme de l'electricite, mais l'ADEME la range
  // sous "Électricité" seulement parfois. Deviner ferait ecarter la bonne ligne.
  it('refuses a heat pump rather than guessing its energy', () => {
    expect(parseHeatingEnergy('pompe à chaleur air/eau')).toBeNull();
  });

  it('refuses a quote that names no energy', () => {
    expect(parseHeatingEnergy('Chauffage individuel')).toBeNull();
    expect(parseHeatingEnergy('Appartement 3 pièces')).toBeNull();
  });

  it('refuses a quote naming two different energies', () => {
    expect(
      parseHeatingEnergy('chauffage gaz ou électrique au choix'),
    ).toBeNull();
  });

  it('is not fooled by hot water alone', () => {
    expect(parseHeatingEnergy('Eau chaude sanitaire au gaz')).toBeNull();
  });
});
