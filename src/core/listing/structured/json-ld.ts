import {
  parseCity,
  parseCount,
  parsePostalCode,
  parsePriceEur,
  parsePropertyType,
  parseStreetAddress,
  parseSurfaceM2,
} from '../parse-values';
import type { ExtractedValues } from '../types';

const SCRIPT_PATTERN =
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

const LISTING_TYPES = new Set([
  'realestatelisting',
  'product',
  'apartment',
  'house',
  'singlefamilyresidence',
  'residence',
  'accommodation',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flatten(value: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) flatten(item, out);
    return;
  }
  if (!isRecord(value)) return;
  out.push(value);
  for (const nested of Object.values(value)) flatten(nested, out);
}

export function extractJsonLdNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  for (const match of html.matchAll(SCRIPT_PATTERN)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]!.trim());
    } catch {
      continue;
    }
    const collected: Record<string, unknown>[] = [];
    flatten(parsed, collected);
    for (const node of collected) {
      if ('@graph' in node && Object.keys(node).length === 1) continue;
      nodes.push(node);
    }
  }
  return nodes;
}

function typeOf(node: Record<string, unknown>): string {
  const raw = node['@type'];
  if (typeof raw === 'string') return raw.toLowerCase();
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
    return (raw[0] as string).toLowerCase();
  }
  return '';
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}

function quantitativeValue(value: unknown): string | null {
  if (isRecord(value)) return asString(value.value);
  return asString(value);
}

function readAdditionalProperties(
  node: Record<string, unknown>,
  values: Partial<ExtractedValues>,
): void {
  const props = node.additionalProperty;
  if (!Array.isArray(props)) return;
  for (const prop of props) {
    if (!isRecord(prop)) continue;
    const name = asString(prop.name)?.toLowerCase() ?? '';
    const raw = asString(prop.value);
    if (!raw) continue;
    if (name.includes('surface')) {
      values.surfaceM2 ??= parseSurfaceM2(`${raw} m²`);
    } else if (name.includes('pièce') || name.includes('piece')) {
      values.rooms ??= parseCount(raw);
    } else if (name.includes('type')) {
      values.propertyType ??= parsePropertyType(raw);
    }
  }
}

function readAddress(
  node: Record<string, unknown>,
  values: Partial<ExtractedValues>,
): void {
  const address = node.address;
  if (!isRecord(address)) return;
  const street = asString(address.streetAddress);
  if (street) values.streetAddress ??= parseStreetAddress(street);
  const locality = asString(address.addressLocality);
  if (locality) values.city ??= parseCity(locality);
  const postal = asString(address.postalCode);
  if (postal) values.postalCode ??= parsePostalCode(postal);
}

export function mapJsonLdToValues(
  nodes: Record<string, unknown>[],
): Partial<ExtractedValues> {
  const values: Partial<ExtractedValues> = {};
  const titles: string[] = [];

  for (const node of nodes) {
    const type = typeOf(node);
    // why: le noeud Organization porte l'adresse du portail, jamais celle du bien
    if (!LISTING_TYPES.has(type) && type !== 'offer') continue;

    if (type === 'offer') {
      const price = asString(node.price);
      if (price) values.priceEur ??= parsePriceEur(price);
      continue;
    }

    const size = quantitativeValue(node.floorSize);
    if (size) values.surfaceM2 ??= parseSurfaceM2(`${size} m²`);

    const rooms = asString(node.numberOfRooms);
    if (rooms) values.rooms ??= parseCount(rooms);

    const bedrooms = asString(node.numberOfBedrooms);
    if (bedrooms) values.bedrooms ??= parseCount(bedrooms);

    const year = asString(node.yearBuilt);
    if (year) values.yearBuilt ??= parseCount(year);

    const posted = asString(node.datePosted);
    if (posted) values.publishedAt ??= posted;

    const name = asString(node.name);
    if (name) titles.push(name);

    readAddress(node, values);
    readAdditionalProperties(node, values);
  }

  // why: le titre est une heuristique et doit passer APRES tous les champs
  // structures, sinon un prix a 5 chiffres ("89000 € Lyon (69001)") est capte
  // comme code postal et ??= empeche l'adresse structuree de le corriger
  for (const title of titles) {
    values.propertyType ??= parsePropertyType(title);
    values.postalCode ??= parsePostalCode(title);
  }

  for (const key of Object.keys(values) as (keyof ExtractedValues)[]) {
    if (values[key] === null || values[key] === undefined) delete values[key];
  }
  return values;
}
