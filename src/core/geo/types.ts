export type GeoPoint = {
  latitude: number;
  longitude: number;
};

// why: what a geocoder answered for a free-text address. `kind` tells a house
// number from a street or a locality: only a house number is an address.
export type GeocodedAddress = {
  label: string;
  houseNumber: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  inseeCode: string | null;
  banId: string | null;
  kind: string;
  score: number;
  point: GeoPoint;
};

export type RawStreetLine = {
  houseNumber: string;
  streetType: string | null;
  words: readonly string[];
};
