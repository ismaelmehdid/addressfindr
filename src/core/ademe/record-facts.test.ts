import { describe, expect, it } from 'vitest';
import { dpeDate, placeLine, reliableFloor, streetLine } from './record-facts';

describe('streetLine', () => {
  it('joins the house number and the street', () => {
    expect(
      streetLine({
        address: '16 Rue Lavoisier 69003 Lyon',
        streetNumber: '16',
        street: 'Rue Lavoisier',
      }),
    ).toBe('16 Rue Lavoisier');
  });

  it('keeps the street alone when there is no number', () => {
    expect(
      streetLine({
        address: 'Rue Lavoisier 69003 Lyon',
        streetNumber: null,
        street: 'Rue Lavoisier',
      }),
    ).toBe('Rue Lavoisier');
  });

  it('falls back to the full address when the street is unknown', () => {
    expect(
      streetLine({
        address: '16 Rue Lavoisier 69003 Lyon',
        streetNumber: '16',
        street: null,
      }),
    ).toBe('16 Rue Lavoisier 69003 Lyon');
  });
});

describe('placeLine', () => {
  it('joins the postal code and the city', () => {
    expect(placeLine({ postalCode: '69003', city: 'Lyon' })).toBe('69003 Lyon');
  });

  it('keeps what is known', () => {
    expect(placeLine({ postalCode: null, city: 'Lyon' })).toBe('Lyon');
  });

  it('has nothing to say when both are unknown', () => {
    expect(placeLine({ postalCode: null, city: null })).toBeNull();
  });
});

describe('reliableFloor', () => {
  // why: ADEME stores 0 as a default floor on most rows (85 of 89 measured),
  // so 0 never means "ground floor".
  it('ignores floor 0', () => {
    expect(reliableFloor({ floor: 0 })).toBeNull();
  });

  it('keeps a real floor', () => {
    expect(reliableFloor({ floor: 3 })).toBe(3);
  });

  it('ignores a missing, negative or fractional floor', () => {
    expect(reliableFloor({ floor: null })).toBeNull();
    expect(reliableFloor({ floor: -1 })).toBeNull();
    expect(reliableFloor({ floor: 2.5 })).toBeNull();
  });
});

describe('dpeDate', () => {
  it('reads an ISO date as UTC midnight', () => {
    expect(dpeDate({ establishedOn: '2023-04-12' })?.toISOString()).toBe(
      '2023-04-12T00:00:00.000Z',
    );
  });

  it('rejects a date that does not exist', () => {
    expect(dpeDate({ establishedOn: '2023-02-30' })).toBeNull();
  });

  it('rejects any other format', () => {
    expect(dpeDate({ establishedOn: '12/04/2023' })).toBeNull();
    expect(dpeDate({ establishedOn: '2023-04-12T10:00:00Z' })).toBeNull();
    expect(dpeDate({ establishedOn: null })).toBeNull();
  });
});
