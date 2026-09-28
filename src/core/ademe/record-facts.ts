import type { ExtractedValues } from '@/core/listing/types';
import type { DpeRecord } from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function streetLine(
  record: Pick<DpeRecord, 'address' | 'street' | 'streetNumber'>,
): string {
  if (record.street === null) return record.address;
  return [record.streetNumber, record.street]
    .filter((part) => part !== null)
    .join(' ');
}

export function placeLine(
  record: Pick<DpeRecord, 'postalCode' | 'city'>,
): string | null {
  const place = [record.postalCode, record.city]
    .filter((part) => part !== null)
    .join(' ');
  return place.length > 0 ? place : null;
}

// why: ADEME stores 0 as a default floor on most rows, so only a floor of 1
// or more is a real reading.
export function reliableFloor(record: Pick<DpeRecord, 'floor'>): number | null {
  const { floor } = record;
  return floor !== null && Number.isInteger(floor) && floor >= 1 ? floor : null;
}

function parseStrictIsoDate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  // why: invalid month/day (e.g., 2023-13-01) produce an Invalid Date that
  // throws on toISOString(). Check NaN first.
  if (Number.isNaN(date.getTime())) return null;
  // why: `new Date` rolls 2023-02-30 over to March 2 instead of failing.
  return date.toISOString().slice(0, 10) === value ? date : null;
}

// why: a ✓ must never sit next to a value the listing does not itself print.
// `matched` (score-candidates.ts) means a signal scored above zero, which the
// DPE date does within a 3-day window — too loose to claim exact agreement.
// This reads the date actually shown against the listing's own value instead.
export function shownDpeDate(
  record: Pick<DpeRecord, 'establishedOn' | 'visitedOn'>,
  listedDpeDate: string | null,
): { date: Date; agrees: boolean } | null {
  const agrees =
    listedDpeDate !== null &&
    (record.establishedOn === listedDpeDate ||
      record.visitedOn === listedDpeDate);
  // why: when both register dates equal the listed one, establishedOn is
  // preferred; when only one matches, listedDpeDate equals that one's value.
  const shownValue = agrees ? listedDpeDate : record.establishedOn;
  const date = shownValue === null ? null : parseStrictIsoDate(shownValue);
  return date === null ? null : { date, agrees };
}

export function copyableAddress(
  record: Pick<
    DpeRecord,
    'address' | 'street' | 'streetNumber' | 'postalCode' | 'city'
  >,
): string {
  // why: without a parsed street, the full address already carries the
  // postal code and the city.
  if (record.street === null) return record.address;
  const place = placeLine(record);
  const street = streetLine(record);
  return place === null ? street : `${street}, ${place}`;
}

type AgreementFields =
  | 'propertyType'
  | 'surfaceM2'
  | 'yearBuilt'
  | 'heatingEnergy'
  | 'floor';

export type FactAgreement = Record<AgreementFields, boolean>;

const SURFACE_AGREEMENT_M2 = 1;

// why: 63.9 - 62.9 is 1.0000000000000142 in floating point, so the gap is
// compared in whole hundredths of a square metre.
function surfacesAgree(record: number | null, listing: number | null): boolean {
  return (
    record !== null &&
    listing !== null &&
    Math.round(Math.abs(listing - record) * 100) <= SURFACE_AGREEMENT_M2 * 100
  );
}

// why: a tile's ✓ is a display match, not scoring evidence — it means the
// shown value equals the listing's own value (the surface within 1 m²), never
// "scored above zero" (a hard-filter signal like surface always does).
export function factAgreement(
  record: Pick<DpeRecord, AgreementFields>,
  listing: Pick<ExtractedValues, AgreementFields>,
): FactAgreement {
  const floor = reliableFloor(record);
  return {
    propertyType:
      record.propertyType !== null &&
      listing.propertyType !== null &&
      record.propertyType === listing.propertyType,
    surfaceM2: surfacesAgree(record.surfaceM2, listing.surfaceM2),
    yearBuilt:
      record.yearBuilt !== null &&
      listing.yearBuilt !== null &&
      record.yearBuilt === listing.yearBuilt,
    heatingEnergy:
      record.heatingEnergy !== null &&
      listing.heatingEnergy !== null &&
      record.heatingEnergy === listing.heatingEnergy,
    floor: floor !== null && listing.floor !== null && floor === listing.floor,
  };
}
