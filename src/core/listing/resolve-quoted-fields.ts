import { withinBounds } from './field-bounds';
import {
  parseBedroomCount,
  parseCity,
  parseCount,
  parseDpeEnergyValue,
  parseEnergyClass,
  parseGesEmissionValue,
  parseHeatingEnergy,
  parseInseeCode,
  parsePostalCode,
  parsePriceEur,
  parsePropertyType,
  parseRoomCount,
  parseStreetAddress,
  parseSurfaceM2,
  parseTransactionType,
  parseYear,
} from './parse-values';
import type { ExtractedFieldName, ExtractedValues } from './types';

export function normalizeForQuoteMatch(text: string): string {
  return text
    .replace(/[    ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function quoteExistsInSource(source: string, quote: string): boolean {
  const needle = normalizeForQuoteMatch(quote);
  if (needle.length === 0) return false;
  return normalizeForQuoteMatch(source).includes(needle);
}

type FieldParser = (raw: string) => string | number | null;

const PARSERS: Partial<Record<ExtractedFieldName, FieldParser>> = {
  surfaceM2: parseSurfaceM2,
  rooms: parseRoomCount,
  bedrooms: parseBedroomCount,
  floor: parseCount,
  buildingFloors: parseCount,
  yearBuilt: parseYear,
  dpeClass: (quote) => parseEnergyClass(quote, 'dpe'),
  gesClass: (quote) => parseEnergyClass(quote, 'ges'),
  dpeKwhM2Year: parseDpeEnergyValue,
  gesKgCo2M2Year: parseGesEmissionValue,
  heatingEnergy: parseHeatingEnergy,
  city: parseCity,
  postalCode: parsePostalCode,
  inseeCode: parseInseeCode,
  streetAddress: parseStreetAddress,
  priceEur: parsePriceEur,
  propertyType: parsePropertyType,
  transactionType: parseTransactionType,
};

export function resolveQuotedFields(args: {
  source: string;
  quotes: Partial<Record<ExtractedFieldName, string>>;
}): Partial<ExtractedValues> {
  const resolved: Partial<ExtractedValues> = {};

  for (const [field, quote] of Object.entries(args.quotes)) {
    if (typeof quote !== 'string') continue;
    const name = field as ExtractedFieldName;
    const parser = PARSERS[name];
    if (!parser) continue;
    if (!quoteExistsInSource(args.source, quote)) continue;

    const value = parser(quote);
    if (value === null) continue;
    if (typeof value === 'number' && !withinBounds(name, value)) continue;

    Object.assign(resolved, { [name]: value });
  }

  return resolved;
}
