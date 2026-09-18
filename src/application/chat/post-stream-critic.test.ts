import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/application/rate-limit/llm-cost-limiter', () => ({
  recordLlmCost: vi.fn(async () => {}),
}));

vi.mock('ai', () => ({ generateObject: vi.fn() }));

vi.mock('@ai-sdk/openai', () => ({
  openai: (m: string) => ({ modelId: m }),
}));

const envMock = vi.hoisted(() => ({
  CHAT_POST_STREAM_CRITIC: true,
  CHEAP_MODEL: 'gpt-5.4-nano',
  OPENAI_API_KEY: 'sk-test',
}));

vi.mock('@/shared/env', () => ({
  env: () => envMock,
}));

import { generateObject } from 'ai';
import { auditCoherence } from './post-stream-critic';

const mockedGen = vi.mocked(generateObject);

beforeEach(() => {
  vi.clearAllMocks();
  envMock.CHAT_POST_STREAM_CRITIC = true;
});

describe('auditCoherence', () => {
  it('no-ops when CHAT_POST_STREAM_CRITIC disabled', async () => {
    envMock.CHAT_POST_STREAM_CRITIC = false;
    await auditCoherence({
      userId: 'u',
      threadId: 't',
      agentId: 'a',
      query: 'q',
      response: 'r',
    });
    expect(mockedGen).not.toHaveBeenCalled();
  });

  it('no-ops on empty response', async () => {
    await auditCoherence({
      userId: 'u',
      threadId: 't',
      agentId: 'a',
      query: 'q',
      response: '   ',
    });
    expect(mockedGen).not.toHaveBeenCalled();
  });

  it('logs ok for faithful verdict', async () => {
    mockedGen.mockResolvedValueOnce({
      object: { coherence: 'faithful', concerns: [] },
      usage: { inputTokens: 10, outputTokens: 10 },
    } as never);
    await expect(
      auditCoherence({
        userId: 'u',
        threadId: 't',
        agentId: 'a',
        query: 'q',
        response: 'r',
      }),
    ).resolves.toBeUndefined();
  });

  it('logs flagged for hallucinated verdict', async () => {
    mockedGen.mockResolvedValueOnce({
      object: {
        coherence: 'hallucinated',
        concerns: ['fabricated row ids'],
      },
      usage: { inputTokens: 10, outputTokens: 10 },
    } as never);
    await expect(
      auditCoherence({
        userId: 'u',
        threadId: 't',
        agentId: 'a',
        query: 'q',
        response: 'r',
      }),
    ).resolves.toBeUndefined();
  });

  it('swallows LLM errors and logs warn', async () => {
    mockedGen.mockRejectedValueOnce(new Error('llm down'));
    await expect(
      auditCoherence({
        userId: 'u',
        threadId: 't',
        agentId: 'a',
        query: 'q',
        response: 'r',
      }),
    ).resolves.toBeUndefined();
  });

  it('truncates very long query and response before prompting', async () => {
    mockedGen.mockResolvedValueOnce({
      object: { coherence: 'faithful', concerns: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);
    await auditCoherence({
      userId: 'u',
      threadId: 't',
      agentId: 'a',
      query: 'x'.repeat(2000),
      response: 'y'.repeat(5000),
    });
    const call = mockedGen.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt.length).toBeLessThan(2000 + 5000);
    expect(call.prompt).toContain('…');
  });
});
