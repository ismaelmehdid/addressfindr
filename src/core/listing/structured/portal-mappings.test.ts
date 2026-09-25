import { describe, expect, it } from 'vitest';
import {
  mapHydrationDescription,
  mapHydrationPin,
  mapHydrationToValues,
} from './portal-mappings';

const LEBONCOIN_PAYLOAD = {
  props: {
    pageProps: {
      ad: {
        list_id: 3257628986,
        subject: 'Duplex 4 pièces 102 m²',
        body: 'Duplex lumineux.\nDate de réalisation du diagnostic énergétique : 14/04/2022',
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
          { key: 'heating_mode', value: 'gas', value_label: 'Gaz' },
          { key: 'land_plot_surface', value: '340', value_label: '340 m²' },
          {
            key: 'annual_energy_budget_min',
            value: '1290',
            value_label: '1290 €',
          },
          {
            key: 'annual_energy_budget_max',
            value: '1790',
            value_label: '1790 €',
          },
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

  it('never reads a neighbouring listing nested under the ad', () => {
    const payload = {
      props: {
        pageProps: {
          ad: {
            list_id: 111,
            attributes: [
              { key: 'square', value: '102' },
              { key: 'energy_rate', value: 'b', value_label: 'B' },
            ],
            similar: [
              {
                list_id: 222,
                attributes: [
                  { key: 'square', value: '42' },
                  { key: 'energy_rate', value: 'g', value_label: 'G' },
                ],
              },
            ],
          },
        },
      },
    };
    const values = mapHydrationToValues('leboncoin', payload);
    expect(values.listingId).toBe('111');
    expect(values.surfaceM2).toBe(102);
    expect(values.dpeClass).toBe('B');
  });

  it('prefers the shallowest ad node when a sibling block also has attributes', () => {
    const payload = {
      props: {
        pageProps: {
          ad: { list_id: 111, attributes: [{ key: 'square', value: '102' }] },
          carousel: {
            items: [
              { list_id: 333, attributes: [{ key: 'square', value: '42' }] },
            ],
          },
        },
      },
    };
    expect(mapHydrationToValues('leboncoin', payload).surfaceM2).toBe(102);
  });

  it('reads the heating energy, the plot and the energy cost range', () => {
    const values = mapHydrationToValues('leboncoin', LEBONCOIN_PAYLOAD);
    expect(values.heatingEnergy).toBe('gas');
    expect(values.landSurfaceM2).toBe(340);
    expect(values.annualEnergyCostMinEur).toBe(1290);
    expect(values.annualEnergyCostMaxEur).toBe(1790);
  });

  it('maps electric heating and leaves an unknown heating mode empty', () => {
    const withMode = (mode: string) => ({
      props: {
        pageProps: {
          ad: { attributes: [{ key: 'heating_mode', value: mode }] },
        },
      },
    });
    expect(
      mapHydrationToValues('leboncoin', withMode('electric')).heatingEnergy,
    ).toBe('electricity');
    expect(
      mapHydrationToValues('leboncoin', withMode('other')).heatingEnergy,
    ).toBeUndefined();
  });

  it('drops an energy cost range whose bounds are inverted', () => {
    const payload = {
      props: {
        pageProps: {
          ad: {
            attributes: [
              { key: 'annual_energy_budget_min', value: '1790' },
              { key: 'annual_energy_budget_max', value: '1290' },
            ],
          },
        },
      },
    };
    const values = mapHydrationToValues('leboncoin', payload);
    expect(values.annualEnergyCostMinEur).toBeUndefined();
    expect(values.annualEnergyCostMaxEur).toBeUndefined();
  });
});

describe('mapHydrationDescription', () => {
  it('returns the full leboncoin description of the ad', () => {
    expect(mapHydrationDescription('leboncoin', LEBONCOIN_PAYLOAD)).toBe(
      'Duplex lumineux.\nDate de réalisation du diagnostic énergétique : 14/04/2022',
    );
  });

  it('never returns the description of a neighbouring listing', () => {
    const payload = {
      props: {
        pageProps: {
          ad: {
            attributes: [],
            similar: [{ attributes: [], body: 'DPE réalisé le 01/01/2023' }],
          },
        },
      },
    };
    expect(mapHydrationDescription('leboncoin', payload)).toBeNull();
  });

  it('returns null for a portal with no mapping', () => {
    expect(mapHydrationDescription('orpi', LEBONCOIN_PAYLOAD)).toBeNull();
  });
});

describe('mapHydrationPin', () => {
  // why: measured 2026-09-24, a leboncoin pin placed from a typed address
  // (source "address", not a shape) sat 3 m and 13 m from the dwelling
  // precisement.fr designates. A pin placed on the town centre says nothing.
  function withLocation(location: Record<string, unknown>) {
    return { props: { pageProps: { ad: { attributes: [], location } } } };
  }

  it('reads a pin placed from a typed address', () => {
    expect(
      mapHydrationPin(
        'leboncoin',
        withLocation({
          lat: 47.21559,
          lng: -1.55507,
          source: 'address',
          is_shape: false,
        }),
      ),
    ).toEqual({ latitude: 47.21559, longitude: -1.55507 });
  });

  it('ignores a pin placed on the town', () => {
    expect(
      mapHydrationPin(
        'leboncoin',
        withLocation({
          lat: 45.731728,
          lng: 4.874846,
          source: 'city',
          is_shape: true,
        }),
      ),
    ).toBeNull();
  });

  it('ignores an address pin drawn as a shape', () => {
    expect(
      mapHydrationPin(
        'leboncoin',
        withLocation({
          lat: 45.731728,
          lng: 4.874846,
          source: 'address',
          is_shape: true,
        }),
      ),
    ).toBeNull();
  });

  it('returns null for a portal with no mapping', () => {
    expect(
      mapHydrationPin(
        'orpi',
        withLocation({ lat: 1, lng: 1, source: 'address', is_shape: false }),
      ),
    ).toBeNull();
  });
});
