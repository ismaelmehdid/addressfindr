import {
  EMPTY_EXTRACTED_VALUES,
  EXTRACTED_FIELD_NAMES,
  type ExtractedFieldName,
  type ExtractedValues,
  type FieldSource,
  REQUIRED_FIELDS,
} from './types';

export type ExtractionLayer = {
  source: Exclude<FieldSource, 'absent'>;
  values: Partial<ExtractedValues>;
};

const PRECEDENCE: readonly Exclude<FieldSource, 'absent'>[] = [
  'hydration',
  'json-ld',
  'llm',
];

export function mergeExtractions(layers: readonly ExtractionLayer[]): {
  values: ExtractedValues;
  sources: Record<ExtractedFieldName, FieldSource>;
} {
  const values: ExtractedValues = { ...EMPTY_EXTRACTED_VALUES };
  const sources = {} as Record<ExtractedFieldName, FieldSource>;

  for (const field of EXTRACTED_FIELD_NAMES) {
    sources[field] = 'absent';
  }

  for (const source of PRECEDENCE) {
    for (const layer of layers) {
      if (layer.source !== source) continue;
      for (const field of EXTRACTED_FIELD_NAMES) {
        if (sources[field] !== 'absent') continue;
        const candidate = layer.values[field];
        if (candidate === null || candidate === undefined) continue;
        Object.assign(values, { [field]: candidate });
        sources[field] = source;
      }
    }
  }

  return { values, sources };
}

export function missingRequiredFields(
  values: ExtractedValues,
): ExtractedFieldName[] {
  return REQUIRED_FIELDS.filter((field) => values[field] === null);
}

export function unfilledFields(values: ExtractedValues): ExtractedFieldName[] {
  return EXTRACTED_FIELD_NAMES.filter((field) => values[field] === null);
}
