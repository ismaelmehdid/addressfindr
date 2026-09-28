import { describe, expect, it } from 'vitest';
import {
  copyableAddress,
  factAgreement,
  placeLine,
  reliableFloor,
  shownDpeDate,
  streetLine,
} from './record-facts';

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

describe('shownDpeDate', () => {
  it('reads an ISO date as UTC midnight and agrees when it matches the listing', () => {
    const result = shownDpeDate(
      { establishedOn: '2023-04-12', visitedOn: null },
      '2023-04-12',
    );
    expect(result?.date.toISOString()).toBe('2023-04-12T00:00:00.000Z');
    expect(result?.agrees).toBe(true);
  });

  it('shows the visited date, agreeing, when that is the one the listing names', () => {
    const result = shownDpeDate(
      { establishedOn: '2023-04-10', visitedOn: '2023-04-12' },
      '2023-04-12',
    );
    expect(result?.date.toISOString()).toBe('2023-04-12T00:00:00.000Z');
    expect(result?.agrees).toBe(true);
  });

  it('falls back to the established date, disagreeing, when neither date matches the listing', () => {
    const result = shownDpeDate(
      { establishedOn: '2023-04-10', visitedOn: '2023-04-11' },
      '2023-04-12',
    );
    expect(result?.date.toISOString()).toBe('2023-04-10T00:00:00.000Z');
    expect(result?.agrees).toBe(false);
  });

  it('disagrees when the listing has no DPE date at all', () => {
    const result = shownDpeDate(
      { establishedOn: '2023-04-10', visitedOn: null },
      null,
    );
    expect(result?.date.toISOString()).toBe('2023-04-10T00:00:00.000Z');
    expect(result?.agrees).toBe(false);
  });

  it('rejects a date that does not exist', () => {
    expect(
      shownDpeDate({ establishedOn: '2023-02-30', visitedOn: null }, null),
    ).toBeNull();
  });

  it('rejects any other format', () => {
    expect(
      shownDpeDate({ establishedOn: '12/04/2023', visitedOn: null }, null),
    ).toBeNull();
    expect(
      shownDpeDate(
        { establishedOn: '2023-04-12T10:00:00Z', visitedOn: null },
        null,
      ),
    ).toBeNull();
    expect(
      shownDpeDate({ establishedOn: null, visitedOn: null }, null),
    ).toBeNull();
  });

  it('rejects a month or day outside the calendar', () => {
    expect(
      shownDpeDate({ establishedOn: '2023-13-01', visitedOn: null }, null),
    ).toBeNull();
    expect(
      shownDpeDate({ establishedOn: '2023-04-00', visitedOn: null }, null),
    ).toBeNull();
    expect(
      shownDpeDate({ establishedOn: '2023-04-32', visitedOn: null }, null),
    ).toBeNull();
  });
});

describe('copyableAddress', () => {
  it('joins the street line and the place with a comma', () => {
    expect(
      copyableAddress({
        address: '16 Rue Lavoisier 69003 Lyon',
        streetNumber: '16',
        street: 'Rue Lavoisier',
        postalCode: '69003',
        city: 'Lyon',
      }),
    ).toBe('16 Rue Lavoisier, 69003 Lyon');
  });

  it('keeps what is known of the place', () => {
    expect(
      copyableAddress({
        address: '16 Rue Lavoisier Lyon',
        streetNumber: '16',
        street: 'Rue Lavoisier',
        postalCode: null,
        city: 'Lyon',
      }),
    ).toBe('16 Rue Lavoisier, Lyon');
  });

  it('copies the street line alone when the place is unknown', () => {
    expect(
      copyableAddress({
        address: '16 Rue Lavoisier',
        streetNumber: '16',
        street: 'Rue Lavoisier',
        postalCode: null,
        city: null,
      }),
    ).toBe('16 Rue Lavoisier');
  });

  // why: the full address already ends with the postal code and the city;
  // appending them again would copy them twice.
  it('copies the full address as it is when the street is unknown', () => {
    expect(
      copyableAddress({
        address: '16 Rue Lavoisier 69003 Lyon',
        streetNumber: '16',
        street: null,
        postalCode: '69003',
        city: 'Lyon',
      }),
    ).toBe('16 Rue Lavoisier 69003 Lyon');
  });
});

describe('factAgreement', () => {
  const listing = {
    propertyType: 'apartment' as const,
    surfaceM2: 63,
    yearBuilt: 1990,
    heatingEnergy: 'gas' as const,
    floor: 3,
  };
  const record = {
    propertyType: 'apartment' as const,
    surfaceM2: 63,
    yearBuilt: 1990,
    heatingEnergy: 'gas' as const,
    floor: 3,
  };

  it('agrees on every fact that exactly equals the listing', () => {
    expect(factAgreement(record, listing)).toEqual({
      propertyType: true,
      surfaceM2: true,
      yearBuilt: true,
      heatingEnergy: true,
      floor: true,
    });
  });

  it('disagrees on a different property type', () => {
    expect(
      factAgreement({ ...record, propertyType: 'house' }, listing).propertyType,
    ).toBe(false);
  });

  it('disagrees on a property type the record does not know', () => {
    expect(
      factAgreement({ ...record, propertyType: null }, listing).propertyType,
    ).toBe(false);
  });

  it('agrees on a surface up to 1 m² away, on either side', () => {
    expect(factAgreement({ ...record, surfaceM2: 62 }, listing).surfaceM2).toBe(
      true,
    );
    expect(factAgreement({ ...record, surfaceM2: 64 }, listing).surfaceM2).toBe(
      true,
    );
    expect(
      factAgreement(
        { ...record, surfaceM2: 62.9 },
        { ...listing, surfaceM2: 63.9 },
      ).surfaceM2,
    ).toBe(true);
  });

  it('disagrees on a surface more than 1 m² away', () => {
    expect(
      factAgreement({ ...record, surfaceM2: 64.05 }, listing).surfaceM2,
    ).toBe(false);
    expect(
      factAgreement({ ...record, surfaceM2: 61.5 }, listing).surfaceM2,
    ).toBe(false);
  });

  it('disagrees on a surface either side does not know', () => {
    expect(
      factAgreement({ ...record, surfaceM2: null }, listing).surfaceM2,
    ).toBe(false);
    expect(
      factAgreement(record, { ...listing, surfaceM2: null }).surfaceM2,
    ).toBe(false);
  });

  it('disagrees on a year built one year apart', () => {
    expect(
      factAgreement({ ...record, yearBuilt: 1991 }, listing).yearBuilt,
    ).toBe(false);
  });

  it('disagrees when the record side is unknown', () => {
    expect(
      factAgreement({ ...record, heatingEnergy: null }, listing).heatingEnergy,
    ).toBe(false);
  });

  it('disagrees when the listing side is unknown', () => {
    expect(
      factAgreement(record, { ...listing, heatingEnergy: null }).heatingEnergy,
    ).toBe(false);
  });

  it('never agrees on a floor of 0, the ADEME default', () => {
    expect(
      factAgreement({ ...record, floor: 0 }, { ...listing, floor: 0 }).floor,
    ).toBe(false);
  });
});
