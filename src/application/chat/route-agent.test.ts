import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/shared/env', () => ({
  env: () => ({ CHEAP_MODEL: 'gpt-5.4-nano', OPENAI_API_KEY: 'sk-test' }),
}));

vi.mock('@/application/rate-limit/llm-cost-limiter', () => ({
  recordLlmCost: vi.fn(async () => {}),
}));

vi.mock('ai', () => ({ generateObject: vi.fn() }));

vi.mock('@ai-sdk/openai', () => ({
  openai: (m: string) => ({ modelId: m }),
}));

import { generateObject } from 'ai';
import { CHAT_AGENT } from '@/core/agents/agent-ids';
import { routeChatRequest } from './route-agent';

const mockedGen = vi.mocked(generateObject);

function mockTarget(target: string, confidence = 0.9): void {
  mockedGen.mockResolvedValueOnce({
    object: { target, confidence, reason: 'r' },
    usage: { inputTokens: 10, outputTokens: 5 },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('routeChatRequest — attachment bypass (only deterministic fast-path)', () => {
  it('bypass-attachment when attachments present, no LLM call', async () => {
    const r = await routeChatRequest({
      userId: 'u',
      userText: 'whatever',
      hasAttachments: true,
    });
    expect(r.agentId).toBe(CHAT_AGENT.KNOWLEDGE);
    expect(r.source).toBe('bypass-attachment');
    expect(mockedGen).not.toHaveBeenCalled();
  });

  it('attachment on a file page → KNOWLEDGE', async () => {
    const r = await routeChatRequest({
      userId: 'u',
      userText: 'use this screenshot',
      hasAttachments: true,
      pageContext: { kind: 'storage-file', id: 'f-1' },
    });
    expect(r.agentId).toBe(CHAT_AGENT.KNOWLEDGE);
    expect(r.source).toBe('bypass-attachment');
  });
});

describe('routeChatRequest — classifier path (every non-attachment message)', () => {
  it('returns target agent and echoes confidence', async () => {
    mockTarget('knowledge', 0.9);
    const r = await routeChatRequest({
      userId: 'u',
      userText: 'what does the contract say about termination?',
      hasAttachments: false,
    });
    expect(r.source).toBe('router');
    expect(r.agentId).toBe(CHAT_AGENT.KNOWLEDGE);
    expect(r.confidence).toBe(0.9);
  });

  it('short message also goes through the classifier (no word-count bypass)', async () => {
    mockTarget('generalist', 0.4);
    const r = await routeChatRequest({
      userId: 'u',
      userText: 'hi',
      hasAttachments: false,
    });
    expect(mockedGen).toHaveBeenCalledOnce();
    expect(r.source).toBe('router');
    expect(r.agentId).toBe(CHAT_AGENT.GENERALIST);
  });

  it('no confidence gate: low self-reported confidence still routes to target', async () => {
    mockTarget('knowledge', 0.2);
    const r = await routeChatRequest({
      userId: 'u',
      userText: 'find the totals in my uploaded report',
      hasAttachments: false,
      previousAgentId: CHAT_AGENT.GENERALIST,
    });
    expect(r.source).toBe('router');
    expect(r.agentId).toBe(CHAT_AGENT.KNOWLEDGE);
  });

  it('all target labels map to a real ChatAgentId', async () => {
    const targets = [
      { target: 'knowledge', expected: CHAT_AGENT.KNOWLEDGE },
      { target: 'help', expected: CHAT_AGENT.HELP },
      { target: 'generalist', expected: CHAT_AGENT.GENERALIST },
    ];
    for (const t of targets) {
      mockTarget(t.target, 0.95);
      const r = await routeChatRequest({
        userId: 'u',
        userText: 'a message that reaches the classifier',
        hasAttachments: false,
      });
      expect(r.agentId).toBe(t.expected);
    }
  });

  it('passes abortSignal and maxRetries:1', async () => {
    mockTarget('help', 0.9);
    await routeChatRequest({
      userId: 'u',
      userText: 'a message that reaches the classifier',
      hasAttachments: false,
    });
    const call = mockedGen.mock.calls[0]?.[0] as {
      maxRetries?: number;
      abortSignal?: AbortSignal;
    };
    expect(call.maxRetries).toBe(1);
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
  });
});

describe('routeChatRequest — page context is trusted to the classifier (no post-hoc clamp)', () => {
  it('classifier target wins on a page; page context is not re-applied afterwards', async () => {
    // The classifier already receives PAGE CONTEXT in its prompt. We do not
    // second-guess it with a confidence-gated clamp — verbalized confidence is
    // not reliable enough to override a clear decision.
    mockTarget('help', 0.65);
    const r = await routeChatRequest({
      userId: 'u',
      userText: 'how do I upload another file?',
      hasAttachments: false,
      pageContext: { kind: 'storage-file', id: 'f-1' },
    });
    expect(r.source).toBe('router');
    expect(r.agentId).toBe(CHAT_AGENT.HELP);
  });
});

describe('routeChatRequest — error fallback', () => {
  it('classifier throws → previous agent', async () => {
    mockedGen.mockRejectedValueOnce(new Error('llm down'));
    const r = await routeChatRequest({
      userId: 'u',
      userText: 'a message that reaches the classifier',
      hasAttachments: false,
      previousAgentId: CHAT_AGENT.HELP,
    });
    expect(r.source).toBe('fallback-error');
    expect(r.agentId).toBe(CHAT_AGENT.HELP);
  });

  it('classifier throws → page context wins over previous agent', async () => {
    mockedGen.mockRejectedValueOnce(new Error('llm down'));
    const r = await routeChatRequest({
      userId: 'u',
      userText: 'observations я же сказал',
      hasAttachments: false,
      previousAgentId: CHAT_AGENT.HELP,
      pageContext: { kind: 'storage-file', id: 'f-1' },
    });
    expect(r.agentId).toBe(CHAT_AGENT.KNOWLEDGE);
  });

  it('classifier throws, no page/prev, help-pattern text → HELP', async () => {
    mockedGen.mockRejectedValueOnce(new Error('llm down'));
    const r = await routeChatRequest({
      userId: 'u',
      userText: 'как сменить язык интерфейса',
      hasAttachments: false,
    });
    expect(r.agentId).toBe(CHAT_AGENT.HELP);
  });
});
