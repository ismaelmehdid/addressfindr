import { describe, expect, it } from 'vitest';
import { mapHydrationToValues } from './portal-mappings';

const LEBONCOIN_PAYLOAD = {
  props: {
    pageProps: {
      ad: {
        list_id: 3257628986,
        subject: 'Duplex 4 pièces 102 m²',
        first_publication_date: '2026-09-02 10:14:21',
        price: [376100],
        location: {
          city: "Saint-Ouen-l'Aumône",
          zipcode: '95310',
          lat: 49.046547,
          lng: 2.1068132,
        },
        attributes: [
          { key: 'real_estate_type', value: '2', value_label: 'Appartement' },
          { key: 'square', value: '102', value_label: '102 m²' },
          { key: 'rooms', value: '4', value_label: '4' },
          { key: 'bedrooms', value: '2', value_label: '2 ch.' },
          { key: 'energy_rate', value: 'b', value_label: 'B' },
          { key: 'ges', value: 'b', value_label: 'B' },
          { key: 'floor_number', value: '1', value_label: '1' },
          { key: 'nb_floors_building', value: '5', value_label: '5' },
          { key: 'building_year', value: '2005', value_label: '2005' },
        ],
      },
    },
  },
};

describe('mapHydrationToValues — leboncoin', () => {
  it('reads every matching field', () => {
    const values = mapHydrationToValues('leboncoin', LEBONCOIN_PAYLOAD);
    expect(values.surfaceM2).toBe(102);
    expect(values.rooms).toBe(4);
    expect(values.bedrooms).toBe(2);
    expect(values.floor).toBe(1);
    expect(values.buildingFloors).toBe(5);
    expect(values.yearBuilt).toBe(2005);
    expect(values.propertyType).toBe('apartment');
  });

  it('upper-cases the energy letters', () => {
    const values = mapHydrationToValues('leboncoin', LEBONCOIN_PAYLOAD);
    expect(values.dpeClass).toBe('B');
    expect(values.gesClass).toBe('B');
  });

  it('reads the location block', () => {
    const values = mapHydrationToValues('leboncoin', LEBONCOIN_PAYLOAD);
    expect(values.city).toBe("Saint-Ouen-l'Aumône");
    expect(values.postalCode).toBe('95310');
  });

  it('reads the listing id', () => {
    const values = mapHydrationToValues('leboncoin', LEBONCOIN_PAYLOAD);
    expect(values.listingId).toBe('3257628986');
  });

  it('drops an out-of-bounds value instead of keeping it', () => {
    const payload = {
      props: {
        pageProps: {
          ad: { attributes: [{ key: 'square', value: '99999' }] },
        },
      },
    };
    expect(
      mapHydrationToValues('leboncoin', payload).surfaceM2,
    ).toBeUndefined();
  });

  it('returns an empty object for a portal with no mapping', () => {
    expect(mapHydrationToValues('orpi', LEBONCOIN_PAYLOAD)).toEqual({});
  });

  it('returns an empty object for a null payload', () => {
    expect(mapHydrationToValues('leboncoin', null)).toEqual({});
  });
});
