import { describe, expect, it } from 'vitest';
import { checkDomainBoundaries } from '../scripts/check-domain-boundaries.mjs';

describe('domain boundaries', () => {
  it('has no cross-domain violations', () => {
    const violations = checkDomainBoundaries();
    const rendered = violations
      .map(
        (v: { file: string; line: number; rule: string; message: string }) =>
          `${v.file}:${v.line} [${v.rule}] ${v.message}`,
      )
      .join('\n');
    expect(violations, rendered).toEqual([]);
  });
});
