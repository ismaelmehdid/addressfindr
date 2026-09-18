import { handleChatStream } from '@mastra/ai-sdk';
import { waitUntil } from '@vercel/functions';
import { createUIMessageStreamResponse, type UIMessage } from 'ai';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import * as v from 'valibot';
import { expandChatAttachments } from '@/application/chat/expand-attachments';
import { auditCoherence } from '@/application/chat/post-stream-critic';
import { resolvePageContextToSystemPrompt } from '@/application/chat/resolve-page-context';
import {
  pageContextAgent,
  routeChatRequest,
} from '@/application/chat/route-agent';
import { lastAssistantAgentIdFromThread } from '@/application/conversation/last-agent-from-thread';
import { getCurrentUser } from '@/application/me/get-current-user';
import { applyRateLimit } from '@/application/rate-limit/apply-rate-limit';
import {
  checkLlmBudget,
  recordLlmCost,
} from '@/application/rate-limit/llm-cost-limiter';
import { CHAT_AGENT, type ChatAgentId } from '@/core/agents/agent-ids';
import {
  type PageContext,
  PageContextKind,
  PageContextSchema,
} from '@/core/chat/page-context';
import {
  LAST_CONVERSATION_COOKIE,
  LAST_CONVERSATION_COOKIE_MAX_AGE,
} from '@/core/conversation/cookies';
import {
  forbidden,
  rateLimited,
  unauthorized,
  unknown as unknownError,
  validation,
} from '@/core/errors';
import { mastra, memory } from '@/infra/external-apis/mastra/instance';
import { env } from '@/shared/env';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';
import {
  addCurrentSpanAttributes,
  withSpan,
} from '@/shared/telemetry/with-span';
import { newId } from '@/shared/utils/id';

const ChatRequestBodySchema = v.object({
  messages: v.pipe(v.array(v.unknown()), v.maxLength(1000)),
  conversationId: v.optional(
    v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  ),
  trigger: v.optional(
    v.picklist(['submit-message', 'regenerate-message'] as const),
  ),
  pageContext: v.optional(PageContextSchema),
});

type ChatRequestBody = {
  messages: UIMessage[];
  conversationId?: string;
  trigger?: 'submit-message' | 'regenerate-message';
  pageContext?: PageContext;
};

const TextPartSchema = v.object({
  type: v.literal('text'),
  text: v.string(),
});

const FilePartSchema = v.object({
  type: v.literal('file'),
});

const TextDeltaChunkSchema = v.object({
  type: v.literal('text-delta'),
  delta: v.string(),
});

const TextChunkSchema = v.object({
  type: v.literal('text'),
  text: v.string(),
});

const UsageSchema = v.object({
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  totalTokens: v.optional(v.number()),
  cachedInputTokens: v.optional(v.number()),
});

const FinishStepChunkSchema = v.object({
  type: v.literal('finish-step'),
  usage: v.optional(UsageSchema),
});

const FinishChunkSchema = v.object({
  type: v.literal('finish'),
  totalUsage: v.optional(UsageSchema),
});

const FinishReasonChunkSchema = v.object({
  type: v.literal('finish'),
  finishReason: v.optional(
    v.picklist([
      'stop',
      'length',
      'content-filter',
      'tool-calls',
      'error',
      'other',
    ] as const),
  ),
});

type CutoffReason = 'tool-calls' | 'length';

function cutoffReasonFromChunk(chunk: unknown): CutoffReason | null {
  const parsed = v.safeParse(FinishReasonChunkSchema, chunk);
  if (!parsed.success) return null;
  const reason = parsed.output.finishReason;
  if (reason === 'tool-calls' || reason === 'length') return reason;
  return null;
}

type AggregatedUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};

function aggregateUsageFromChunk(
  chunk: unknown,
  acc: AggregatedUsage,
  finalUsage: AggregatedUsage | null,
): AggregatedUsage | null {
  const finish = v.safeParse(FinishChunkSchema, chunk);
  if (finish.success && finish.output.totalUsage) {
    return {
      inputTokens: finish.output.totalUsage.inputTokens ?? 0,
      outputTokens: finish.output.totalUsage.outputTokens ?? 0,
      cachedInputTokens: finish.output.totalUsage.cachedInputTokens ?? 0,
    };
  }
  const step = v.safeParse(FinishStepChunkSchema, chunk);
  if (step.success && step.output.usage) {
    acc.inputTokens += step.output.usage.inputTokens ?? 0;
    acc.outputTokens += step.output.usage.outputTokens ?? 0;
    acc.cachedInputTokens += step.output.usage.cachedInputTokens ?? 0;
  }
  return finalUsage;
}

function modelForAgent(agentId: ChatAgentId): string {
  const e = env();
  if (agentId === CHAT_AGENT.HELP) return e.CHEAP_MODEL;
  return e.CHAT_MODEL;
}

const DEFAULT_MAX_STEPS = 8;

function maxStepsForAgent(_agentId: ChatAgentId): number {
  return DEFAULT_MAX_STEPS;
}

function extractStreamText(chunk: unknown): string {
  const delta = v.safeParse(TextDeltaChunkSchema, chunk);
  if (delta.success) return delta.output.delta;
  const text = v.safeParse(TextChunkSchema, chunk);
  if (text.success) return text.output.text;
  return '';
}

function extractMessageText(message: UIMessage): string {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const chunks: string[] = [];
  for (const part of parts) {
    const parsed = v.safeParse(TextPartSchema, part);
    if (parsed.success) chunks.push(parsed.output.text);
  }
  return chunks.join(' ').trim();
}

function hasFileAttachments(message: UIMessage): boolean {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  for (const part of parts) {
    const parsed = v.safeParse(FilePartSchema, part);
    if (parsed.success) return true;
  }
  return false;
}

function findLastMessageByRole(
  messages: UIMessage[],
  role: UIMessage['role'],
): UIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m && m.role === role) return m;
  }
  return undefined;
}

function toRoutingPageContext(
  pageContext: PageContext | undefined,
): { kind: 'none' } | { kind: 'storage-file'; id: string } | undefined {
  if (!pageContext) return undefined;
  switch (pageContext.kind) {
    case PageContextKind.STORAGE_FILE:
      return { kind: 'storage-file', id: pageContext.id };
    case PageContextKind.NONE:
      return { kind: 'none' };
    default:
      return undefined;
  }
}

function dropTrailingAssistantAndTools(messages: UIMessage[]): UIMessage[] {
  let end = messages.length;
  while (end > 0) {
    const m = messages[end - 1];
    if (!m) break;
    if (m.role === 'assistant' || (m.role as string) === 'tool') {
      end -= 1;
      continue;
    }
    break;
  }
  return end === messages.length ? messages : messages.slice(0, end);
}

type ToolCallSummary = { name: string; failed: boolean; errorMessage?: string };

function extractToolCallsFromMessage(message: UIMessage): ToolCallSummary[] {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const out: ToolCallSummary[] = [];
  for (const part of parts) {
    if (
      part === null ||
      typeof part !== 'object' ||
      typeof (part as { type?: unknown }).type !== 'string'
    ) {
      continue;
    }
    const type = (part as { type: string }).type;
    if (!type.startsWith('tool-') || type === 'dynamic-tool') continue;
    const name = type.slice('tool-'.length);
    const state = (part as { state?: unknown }).state;
    const output = (part as { output?: unknown }).output;
    const isError = state === 'output-error' || state === 'output-denied';
    let failedFromOutput = false;
    let errorMessage: string | undefined;
    if (output && typeof output === 'object') {
      const o = output as Record<string, unknown>;
      if (o.ok === false || (typeof o.error === 'object' && o.error)) {
        failedFromOutput = true;
        const errObj = o.error as Record<string, unknown> | undefined;
        if (errObj && typeof errObj.message === 'string') {
          errorMessage = errObj.message;
        }
      }
    }
    out.push({
      name,
      failed: isError || failedFromOutput,
      ...(errorMessage ? { errorMessage } : {}),
    });
  }
  return out;
}

export async function POST(req: Request): Promise<Response> {
  return withSpan({
    name: 'chat.turn',
    fn: () => handleChatPost(req),
  });
}

async function handleChatPost(req: Request): Promise<Response> {
  const tBegin = performance.now();
  let tLast = tBegin;
  const tick = (step: string): void => {
    const now = performance.now();
    log.info('chat.timing', {
      step,
      stepMs: Math.round(now - tLast),
      totalMs: Math.round(now - tBegin),
    });
    tLast = now;
  };

  const currentUser = await getCurrentUser();
  if (currentUser.isErr()) {
    return jsonError(unauthorized(currentUser.error.message));
  }
  const me = currentUser.value;
  if (!me.organizationId) {
    return jsonError(forbidden('Organization required'));
  }
  tick('auth');

  const rateLimit = await applyRateLimit({
    identifier: me.id,
    limit: 'default',
  });
  if (!rateLimit.success) {
    return jsonError(rateLimited('Too many requests. Please slow down.'));
  }
  tick('rate_limit');

  const budget = await checkLlmBudget({ userId: me.id });
  if (budget.isErr()) {
    return jsonError(budget.error);
  }
  if (budget.value.softWarning) {
    log.warn('chat.budget.soft_warning', {
      userId: me.id,
      usedUsd: budget.value.usedUsd,
      limitUsd: budget.value.limitUsd,
      percentUsed: budget.value.percentUsed,
    });
  }
  tick('budget_check');

  const rawBody = await req.json().catch(() => null);
  const parsed = v.safeParse(ChatRequestBodySchema, rawBody);
  if (!parsed.success) {
    return jsonError(
      validation(
        parsed.issues[0]?.message ?? 'Invalid request body',
        String(parsed.issues[0]?.path?.[0]?.key ?? ''),
      ),
    );
  }
  const params = parsed.output as ChatRequestBody;

  tick('body_parse');

  const expanded = await expandChatAttachments({
    messages: params.messages,
    userId: me.id,
    organizationId: me.organizationId,
  });
  if (expanded.isErr()) {
    return jsonError(expanded.error);
  }
  params.messages = expanded.value;
  tick('expand_attachments');

  let threadId: string;
  if (params.conversationId) {
    try {
      const existing = await memory.getThreadById({
        threadId: params.conversationId,
      });
      if (existing && existing.resourceId !== me.id) {
        log.warn('chat.thread_access_denied', {
          userId: me.id,
          threadId: params.conversationId,
          ownerResourceId: existing.resourceId,
        });
        return jsonError(forbidden('Thread not owned by current user'));
      }
      threadId = params.conversationId;
    } catch (e) {
      log.error('chat.thread_lookup_failed', e, {
        userId: me.id,
        threadId: params.conversationId,
      });
      return jsonError(unknownError('Failed to look up conversation'));
    }
  } else {
    threadId = newId();
  }
  tick('thread_resolve');

  const cookieStore = await cookies();
  cookieStore.set(LAST_CONVERSATION_COOKIE, threadId, {
    path: '/',
    maxAge: LAST_CONVERSATION_COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: true,
  });

  const isRegenerate = params.trigger === 'regenerate-message';
  const messagesForRouting = isRegenerate
    ? dropTrailingAssistantAndTools(params.messages)
    : params.messages;
  if (isRegenerate && messagesForRouting.length !== params.messages.length) {
    log.info('chat.router.regenerate_trim', {
      userId: me.id,
      threadId,
      original: params.messages.length,
      trimmed: messagesForRouting.length,
    });
    params.messages = messagesForRouting;
  }

  const lastUserMessage = findLastMessageByRole(messagesForRouting, 'user');
  const lastAssistantMessage = findLastMessageByRole(
    messagesForRouting,
    'assistant',
  );
  const previousAgentIdFromMemory = params.conversationId
    ? await lastAssistantAgentIdFromThread({ threadId, userId: me.id })
    : null;
  const routingPageContext = toRoutingPageContext(params.pageContext);
  const previousAgentId =
    previousAgentIdFromMemory ?? pageContextAgent(routingPageContext);
  const previousToolCalls = lastAssistantMessage
    ? extractToolCallsFromMessage(lastAssistantMessage)
    : [];
  if (lastUserMessage) {
    params.messages = [lastUserMessage];
  }
  const routing = await routeChatRequest({
    userId: me.id,
    userText: lastUserMessage ? extractMessageText(lastUserMessage) : '',
    hasAttachments: lastUserMessage
      ? hasFileAttachments(lastUserMessage)
      : false,
    lastAssistantText: lastAssistantMessage
      ? extractMessageText(lastAssistantMessage)
      : undefined,
    ...(previousAgentId ? { previousAgentId } : {}),
    ...(routingPageContext ? { pageContext: routingPageContext } : {}),
  });
  tick(`router_${routing.source}`);

  const resolvedPageContext = await resolvePageContextToSystemPrompt({
    pageContext: params.pageContext,
    userId: me.id,
    organizationId: me.organizationId,
  });
  tick('resolve_page_context');

  addCurrentSpanAttributes({
    'chat.user_id': me.id,
    'chat.thread_id': threadId,
    'chat.agent_id': routing.agentId,
    'chat.routing.source': routing.source,
    ...(routing.confidence !== undefined
      ? { 'chat.routing.confidence': routing.confidence }
      : {}),
    ...(routing.target ? { 'chat.routing.target': routing.target } : {}),
    'chat.message.word_count': lastUserMessage
      ? extractMessageText(lastUserMessage).split(/\s+/).filter(Boolean).length
      : 0,
    'chat.message.has_attachments': lastUserMessage
      ? hasFileAttachments(lastUserMessage)
      : false,
    ...resolvedPageContext.attributes,
  });

  const systemAddons: string[] = [];
  if (resolvedPageContext.systemPrompt) {
    systemAddons.push(resolvedPageContext.systemPrompt);
  }
  if (
    previousAgentId &&
    previousAgentId !== routing.agentId &&
    lastAssistantMessage
  ) {
    const previousText = extractMessageText(lastAssistantMessage).slice(0, 600);
    const toolLines = previousToolCalls
      .slice(-5)
      .map(
        (t) =>
          `  - ${t.name}${t.failed ? ` FAILED${t.errorMessage ? `: ${t.errorMessage.slice(0, 200)}` : ''}` : ' ok'}`,
      )
      .join('\n');
    systemAddons.push(
      [
        `<handoff_from_previous_agent>`,
        `The user was just working with agent "${previousAgentId}". They have now been routed to you ("${routing.agentId}") because their latest message fits your specialty better.`,
        previousText
          ? `Previous assistant text (truncated):\n${previousText}`
          : null,
        toolLines ? `Previous tool calls:\n${toolLines}` : null,
        `Use this context to understand what the user is following up on. Do NOT repeat the previous agent's work; do what your specialty does given that context.`,
        `</handoff_from_previous_agent>`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  }
  const systemAddon =
    systemAddons.length > 0 ? systemAddons.join('\n\n') : null;

  let capturedUsage: AggregatedUsage | null = null;
  const stream = await handleChatStream({
    mastra,
    agentId: routing.agentId,
    version: 'v6',
    params,
    defaultOptions: {
      memory: {
        resource: me.id,
        thread: threadId,
      },
      ...(systemAddon ? { system: systemAddon } : {}),
      maxSteps: maxStepsForAgent(routing.agentId),
      tracingOptions: {
        metadata: {
          userId: me.id,
          sessionId: threadId,
        },
      },
      onFinish: (event: { totalUsage?: unknown }) => {
        const u = event.totalUsage as
          | {
              inputTokens?: number;
              outputTokens?: number;
              cachedInputTokens?: number;
            }
          | undefined;
        if (!u) return;
        capturedUsage = {
          inputTokens: u.inputTokens ?? 0,
          outputTokens: u.outputTokens ?? 0,
          cachedInputTokens: u.cachedInputTokens ?? 0,
        };
      },
    },
    messageMetadata: ({ part }) =>
      part.type === 'start' ? { agentId: routing.agentId } : undefined,
  });
  tick('handle_chat_stream_returned');

  const tChat = await getTranslations('Chat');
  const cutoffNotice: Record<CutoffReason, string> = {
    'tool-calls': tChat('stepLimitReached'),
    length: tChat('responseLengthLimitReached'),
  };

  const userQuery = lastUserMessage ? extractMessageText(lastUserMessage) : '';
  let assistantBuffer = '';
  let cutoffNoticeInjected = false;
  let lastChunkAt = performance.now();
  const firstSeenAt = new Map<string, number>();
  const chunkTypeCounts = new Map<string, number>();
  const stepUsage: AggregatedUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
  };
  let finalUsage: AggregatedUsage | null = null;
  const chatAgentModel = modelForAgent(routing.agentId);
  const auditedStream = stream.pipeThrough(
    new TransformStream({
      transform: (chunk, controller): void => {
        const now = performance.now();
        const t =
          chunk !== null && typeof chunk === 'object' && 'type' in chunk
            ? String((chunk as { type: unknown }).type)
            : 'unknown';
        if (!firstSeenAt.has(t)) {
          firstSeenAt.set(t, now);
          log.info('chat.timing', {
            step: `first_chunk_type:${t}`,
            stepMs: Math.round(now - lastChunkAt),
            totalMs: Math.round(now - tBegin),
          });
        }
        chunkTypeCounts.set(t, (chunkTypeCounts.get(t) ?? 0) + 1);
        lastChunkAt = now;
        assistantBuffer += extractStreamText(chunk);
        finalUsage = aggregateUsageFromChunk(chunk, stepUsage, finalUsage);
        const cutoffReason = cutoffReasonFromChunk(chunk);
        if (cutoffReason && !cutoffNoticeInjected) {
          cutoffNoticeInjected = true;
          const prefix = assistantBuffer.trim().length > 0 ? '\n\n' : '';
          const noticeId = `cutoff-${threadId}`;
          controller.enqueue({ type: 'text-start', id: noticeId });
          controller.enqueue({
            type: 'text-delta',
            id: noticeId,
            delta: prefix + cutoffNotice[cutoffReason],
          });
          controller.enqueue({ type: 'text-end', id: noticeId });
          log.warn('chat.turn_cutoff', {
            userId: me.id,
            threadId,
            agentId: routing.agentId,
            finishReason: cutoffReason,
            maxSteps: maxStepsForAgent(routing.agentId),
            assistantChars: assistantBuffer.length,
          });
        }
        controller.enqueue(chunk);
      },
      flush: (): void => {
        const now = performance.now();
        const usage: AggregatedUsage = capturedUsage ?? finalUsage ?? stepUsage;
        const cacheHitRate =
          usage.inputTokens > 0
            ? Math.round((usage.cachedInputTokens / usage.inputTokens) * 100)
            : 0;
        log.info('chat.timing', {
          step: 'stream_finished',
          stepMs: Math.round(now - lastChunkAt),
          totalMs: Math.round(now - tBegin),
          assistantChars: assistantBuffer.length,
          chunkTypeCounts: Object.fromEntries(chunkTypeCounts),
          inputTokens: usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens,
          cacheHitPct: cacheHitRate,
          outputTokens: usage.outputTokens,
        });
        if (usage.inputTokens === 0 && usage.outputTokens === 0) {
          log.warn('chat.cost.no_usage_seen', {
            userId: me.id,
            threadId,
            agentId: routing.agentId,
            chunkTypes: Array.from(chunkTypeCounts.keys()),
          });
        } else {
          waitUntil(
            recordLlmCost({
              userId: me.id,
              model: chatAgentModel,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
            }),
          );
        }
        waitUntil(
          auditCoherence({
            userId: me.id,
            threadId,
            agentId: routing.agentId,
            query: userQuery,
            response: assistantBuffer,
          }),
        );
      },
    }),
  );

  return createUIMessageStreamResponse({ stream: auditedStream });
}
