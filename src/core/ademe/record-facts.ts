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

export function dpeDate(record: Pick<DpeRecord, 'establishedOn'>): Date | null {
  const value = record.establishedOn;
  if (value === null || !ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  // why: invalid month/day (e.g., 2023-13-01) produce an Invalid Date that
  // throws on toISOString(). Check NaN first.
  if (Number.isNaN(date.getTime())) return null;
  // why: `new Date` rolls 2023-02-30 over to March 2 instead of failing.
  return date.toISOString().slice(0, 10) === value ? date : null;
}
