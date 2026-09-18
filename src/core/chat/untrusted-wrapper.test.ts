import { describe, expect, it } from 'vitest';
import { wrapUntrusted } from './untrusted-wrapper';

describe('wrapUntrusted', () => {
  it('wraps non-empty text in tags', () => {
    expect(wrapUntrusted('hello')).toBe(
      '<untrusted_source>\nhello\n</untrusted_source>',
    );
  });

  it('returns empty string unchanged', () => {
    expect(wrapUntrusted('')).toBe('');
  });

  it('strips inner untrusted tags to prevent escape', () => {
    const wrapped = wrapUntrusted(
      'before <untrusted_source>inner</untrusted_source> after',
    );
    expect(wrapped).toContain('[stripped:open]');
    expect(wrapped).toContain('[stripped:close]');
    // Outer wrapper still applied; inner duplicates neutralised.
    expect(wrapped.startsWith('<untrusted_source>\n')).toBe(true);
    expect(wrapped.endsWith('\n</untrusted_source>')).toBe(true);
    expect((wrapped.match(/<untrusted_source>/g) ?? []).length).toBe(1);
  });
});
