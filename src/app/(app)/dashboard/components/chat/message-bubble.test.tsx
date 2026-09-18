import { describe, expect, it } from 'vitest';
import { classifyPart } from './message-bubble';

describe('classifyPart tool calls', () => {
  it('classifies a completed tool call as a tool chip', () => {
    const part = {
      type: 'tool-searchUserFiles',
      state: 'output-available',
      toolCallId: 'c1',
      output: { ok: true, snippets: [] },
    };
    expect(classifyPart(part, 0)).toEqual({
      kind: 'tool',
      key: 'tool:c1',
      toolName: 'searchUserFiles',
      state: 'output-available',
    });
  });

  it('hides internal tools', () => {
    const part = {
      type: 'tool-updateWorkingMemory',
      state: 'output-available',
      toolCallId: 'c2',
      output: { ok: true },
    };
    expect(classifyPart(part, 0)).toBeNull();
  });
});
