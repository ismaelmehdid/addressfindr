import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { prependUnique } from './prepend-unique';

function msg(id: string): UIMessage {
  return { id, role: 'user', parts: [] } as UIMessage;
}

describe('prependUnique', () => {
  it('returns the same reference when incoming is empty', () => {
    const prev = [msg('a'), msg('b')];
    expect(prependUnique(prev, [])).toBe(prev);
  });

  it('returns the same reference when all incoming ids are already present', () => {
    const prev = [msg('a'), msg('b')];
    expect(prependUnique(prev, [msg('a'), msg('b')])).toBe(prev);
  });

  it('prepends new messages while keeping previous order', () => {
    const prev = [msg('c'), msg('d')];
    const out = prependUnique(prev, [msg('a'), msg('b')]);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters out incoming messages that duplicate existing ids', () => {
    const prev = [msg('b'), msg('c')];
    const out = prependUnique(prev, [msg('a'), msg('b'), msg('c')]);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns a new array reference when at least one new message is added', () => {
    const prev = [msg('b')];
    const out = prependUnique(prev, [msg('a')]);
    expect(out).not.toBe(prev);
  });
});
