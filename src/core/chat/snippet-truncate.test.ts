import { describe, expect, it } from 'vitest';
import {
  truncateSnippetsByCharBudget,
  truncateTextByCharBudget,
} from './snippet-truncate';

describe('truncateSnippetsByCharBudget', () => {
  it('keeps all items when total stays within budget', () => {
    const items = [{ content: 'aaa' }, { content: 'bb' }];
    const r = truncateSnippetsByCharBudget(items, 10);
    expect(r.items).toEqual(items);
    expect(r.droppedCount).toBe(0);
    expect(r.truncated).toBe(false);
  });

  it('drops items past the budget', () => {
    const items = [
      { content: 'aaaa' },
      { content: 'bbbb' },
      { content: 'cccc' },
    ];
    const r = truncateSnippetsByCharBudget(items, 5);
    expect(r.items).toEqual([{ content: 'aaaa' }]);
    expect(r.droppedCount).toBe(2);
    expect(r.truncated).toBe(true);
  });

  it('always keeps at least the first item, even if oversize', () => {
    const items = [{ content: 'huge content' }, { content: 'more' }];
    const r = truncateSnippetsByCharBudget(items, 3);
    expect(r.items).toEqual([{ content: 'huge content' }]);
    expect(r.droppedCount).toBe(1);
    expect(r.truncated).toBe(true);
  });

  it('handles empty list', () => {
    const r = truncateSnippetsByCharBudget([], 100);
    expect(r.items).toEqual([]);
    expect(r.droppedCount).toBe(0);
    expect(r.truncated).toBe(false);
  });
});

describe('truncateTextByCharBudget', () => {
  it('returns text untouched when below budget', () => {
    expect(truncateTextByCharBudget('hello', 10)).toEqual({
      text: 'hello',
      truncated: false,
    });
  });

  it('returns text untouched when exactly at budget', () => {
    const text = 'x'.repeat(10);
    expect(truncateTextByCharBudget(text, 10).truncated).toBe(false);
  });

  it('truncates and appends note when over budget', () => {
    const text = 'x'.repeat(20);
    const out = truncateTextByCharBudget(text, 5);
    expect(out.truncated).toBe(true);
    expect(out.text.startsWith('xxxxx')).toBe(true);
    expect(out.text).toContain('[content truncated to fit context budget]');
  });
});
