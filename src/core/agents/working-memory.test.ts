import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { WorkingMemoryJsonSchema, WorkingMemorySchema } from './working-memory';

describe('WorkingMemorySchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(v.is(WorkingMemorySchema, {})).toBe(true);
  });

  it('accepts the documented field', () => {
    expect(v.is(WorkingMemorySchema, { userNotes: 'prefers French' })).toBe(
      true,
    );
  });

  it('rejects oversize userNotes (>2000 chars)', () => {
    expect(v.is(WorkingMemorySchema, { userNotes: 'x'.repeat(2001) })).toBe(
      false,
    );
  });

  it('rejects wrong types', () => {
    expect(v.is(WorkingMemorySchema, { userNotes: 123 })).toBe(false);
  });
});

describe('WorkingMemoryJsonSchema', () => {
  it('exports a Standard Schema wrapper from valibot', () => {
    expect(WorkingMemoryJsonSchema).toBeTypeOf('object');
    const wrapped = WorkingMemoryJsonSchema as unknown as Record<
      string,
      unknown
    >;
    const standard = wrapped['~standard'] as
      | { vendor?: string; jsonSchema?: unknown }
      | undefined;
    expect(standard?.vendor).toBe('valibot');
    expect(standard?.jsonSchema).toBeDefined();
  });
});
