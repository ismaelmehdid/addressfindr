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

// why: CLAUDE.md — a wrong address costs more than no address, so a tile's
// checkmark must mean the shown value exactly equals the listing's own value,
// never "scored above zero" (a hard-filter signal like surface always does).
export function factAgreement(
  record: Pick<DpeRecord, 'yearBuilt' | 'heatingEnergy' | 'floor'>,
  listing: Pick<ExtractedValues, 'yearBuilt' | 'heatingEnergy' | 'floor'>,
): { yearBuilt: boolean; heatingEnergy: boolean; floor: boolean } {
  const floor = reliableFloor(record);
  return {
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
