import { resolveMappablePoint } from '@/core/geo/resolve-mappable-point';
import type { GeocodedAddress } from '@/core/geo/types';
import type { ExtractedValues } from '@/core/listing/types';
import { addressGroupKey } from './address-identity';
import { rankCandidates } from './score-candidates';
import type { DpeRecord, UnverifiedDpeRecord } from './types';

// why: an unverified row is scored like any other to decide whether it is
// worth a geocoder call. This stand-in never leaves the module: its address
// is the typed text, and it carries no BAN key and no point.
function provisionalRecord(
  row: UnverifiedDpeRecord,
  inseeCode: string,
): DpeRecord {
  const { rawStreet, rawPostalCode, rawCity, ...dwelling } = row;
  return {
    ...dwelling,
    banId: null,
    address: [rawStreet, rawPostalCode, rawCity]
      .filter((part) => part !== null)
      .join(' '),
    streetNumber: null,
    street: null,
    postalCode: rawPostalCode,
    city: rawCity,
    inseeCode,
    geocodingScore: null,
    point: null,
  };
}

export function unverifiedWorthVerifying(input: {
  values: ExtractedValues;
  records: readonly DpeRecord[];
  unverified: readonly UnverifiedDpeRecord[];
  inseeCode: string;
}): UnverifiedDpeRecord[] {
  if (input.unverified.length === 0) return [];
  const provisional = input.unverified.map((row) => ({
    row,
    key: addressGroupKey(provisionalRecord(row, input.inseeCode)),
  }));
  const provisionalKeys = new Set(provisional.map(({ key }) => key));

  const { candidates } = rankCandidates({
    values: input.values,
    records: [
      ...input.records,
      ...input.unverified.map((row) => provisionalRecord(row, input.inseeCode)),
    ],
    truncated: false,
  });
  const shortlisted = new Set(
    candidates
      .map((candidate) => addressGroupKey(candidate.record))
      .filter((key) => provisionalKeys.has(key)),
  );
  return provisional
    .filter(({ key }) => shortlisted.has(key))
    .map(({ row }) => row);
}

export function recordFromVerifiedAddress(
  row: UnverifiedDpeRecord,
  address: GeocodedAddress,
): DpeRecord {
  const {
    rawStreet: _raw,
    rawPostalCode: _postal,
    rawCity: _city,
    ...dwelling
  } = row;
  return {
    ...dwelling,
    banId: address.banId,
    address: address.label,
    streetNumber: address.houseNumber,
    street: address.street,
    postalCode: address.postalCode,
    city: address.city,
    inseeCode: address.inseeCode ?? '',
    geocodingScore: address.score,
    point: resolveMappablePoint({
      rawPoint: `${address.point.latitude},${address.point.longitude}`,
      geocodedToAddress: true,
      postalCode: address.postalCode,
    }),
  };
}
