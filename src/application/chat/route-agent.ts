import 'server-only';

import { openai } from '@ai-sdk/openai';
import { toStandardJsonSchema } from '@valibot/to-json-schema';
import { waitUntil } from '@vercel/functions';
import { generateObject } from 'ai';
import * as v from 'valibot';
import { recordLlmCost } from '@/application/rate-limit/llm-cost-limiter';
import { CHAT_AGENT, type ChatAgentId } from '@/core/agents/agent-ids';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

const ROUTING_TARGET = {
  KNOWLEDGE: 'knowledge',
  HELP: 'help',
  GENERALIST: 'generalist',
} as const;
type RoutingTarget = (typeof ROUTING_TARGET)[keyof typeof ROUTING_TARGET];

const RouterDecisionSchema = v.object({
  target: v.picklist([
    ROUTING_TARGET.KNOWLEDGE,
    ROUTING_TARGET.HELP,
    ROUTING_TARGET.GENERALIST,
  ]),
  confidence: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  reason: v.pipe(v.string(), v.maxLength(160)),
});
type RouterDecision = v.InferOutput<typeof RouterDecisionSchema>;

const ROUTER_SYSTEM = `You are a routing classifier for an AI-first workspace assistant.

Given the user's latest message — plus the page they are currently on, the agent they were just talking to, and a snippet of the prior assistant turn — pick the single sub-agent best suited to handle it. Return strict JSON.

Targets:
- "knowledge" — Q&A over user-uploaded files (PDFs, DOCX, CSV, images) and the open web. Read-only retrieval. ("What files / PDFs do I have", "list my reports" is a request to READ the user's data → "knowledge".)
- "help" — meta questions about THIS app: how to do X in the app, where to find a feature, what a button does, "how do I upload a file", "show me how to invite someone", "what does this page do". Asking ABOUT the app — NOT asking the app to do work on, or enumerate, the user's data.
- "generalist" — multi-domain requests, unclear intent, small talk, greetings, or clarification questions. Use this whenever no single specialty clearly fits.

Routing bias: when the page context or the previous agent points to a specialty AND the latest user message is a natural continuation, STAY with that specialty. Only switch when the message clearly belongs to a different domain.

confidence: 0..1 — your honest probability the target is correct.
reason: max 160 chars, explain in one phrase.

Prefer "generalist" when in doubt. Do not invent. Output JSON only.`;

const ROUTER_TIMEOUT_MS = 3000;

const TARGET_TO_AGENT: Record<RoutingTarget, ChatAgentId> = {
  [ROUTING_TARGET.KNOWLEDGE]: CHAT_AGENT.KNOWLEDGE,
  [ROUTING_TARGET.HELP]: CHAT_AGENT.HELP,
  [ROUTING_TARGET.GENERALIST]: CHAT_AGENT.GENERALIST,
};

export type RoutingPageContext =
  | { kind: 'none' }
  | { kind: 'storage-file'; id: string };

export type RoutingInput = {
  readonly userId: string;
  readonly userText: string;
  readonly hasAttachments: boolean;
  readonly lastAssistantText?: string;
  readonly previousAgentId?: ChatAgentId;
  readonly pageContext?: RoutingPageContext;
};

export type RoutingSource = 'router' | 'bypass-attachment' | 'fallback-error';

export type RoutingOutcome = {
  readonly agentId: ChatAgentId;
  readonly source: RoutingSource;
  readonly target?: RoutingTarget;
  readonly confidence?: number;
  readonly reason?: string;
  readonly previousAgentId?: ChatAgentId;
};

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

// Only meta-help triggers ("how/where/why do I…"). Data-read verbs
// (show/find/покажи/montre/trouve/что/what) are deliberately excluded — the
// router prompt classifies those as knowledge, not app-help.
const HELP_TRIGGER_PATTERN =
  /^(?:где|как|почему|зачем|объясни|помоги|where|how|why|explain|help|où|comment|pourquoi|explique|aide)(?=\s|$|[?!.,;:])/iu;

function looksLikeHelpQuery(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  return HELP_TRIGGER_PATTERN.test(trimmed);
}

function isAttachmentBypass(input: RoutingInput): boolean {
  return input.hasAttachments;
}

function describePageContext(
  pc: RoutingPageContext | undefined,
): string | null {
  if (!pc || pc.kind === 'none') return null;
  if (pc.kind === 'storage-file') {
    return `User is currently viewing storage file ${pc.id}`;
  }
  return null;
}

function buildRouterUserPrompt(input: RoutingInput): string {
  const segments: string[] = [];
  const pageDesc = describePageContext(input.pageContext);
  if (pageDesc) segments.push(`PAGE CONTEXT: ${pageDesc}`);
  if (input.previousAgentId) {
    segments.push(`PREVIOUS AGENT: ${input.previousAgentId}`);
  }
  if (input.lastAssistantText && input.lastAssistantText.trim().length > 0) {
    const trimmed = input.lastAssistantText.trim().slice(0, 400);
    segments.push(`ASSISTANT PRIOR TURN (truncated): ${trimmed}`);
  }
  segments.push(
    `USER MESSAGE${input.hasAttachments ? ' (with file attachments)' : ''}: ${input.userText.trim().slice(0, 1200)}`,
  );
  return segments.join('\n\n');
}

const RouterDecisionJsonSchema = toStandardJsonSchema(RouterDecisionSchema);

async function classify(input: RoutingInput): Promise<RouterDecision> {
  const model = env().CHEAP_MODEL;
  const result = await generateObject({
    model: openai(model),
    schema: RouterDecisionJsonSchema,
    system: ROUTER_SYSTEM,
    prompt: buildRouterUserPrompt(input),
    maxOutputTokens: 200,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(ROUTER_TIMEOUT_MS),
    experimental_telemetry: {
      isEnabled: true,
      recordInputs: false,
      recordOutputs: false,
      functionId: 'chat.router.classify',
      metadata: {
        'chat.router.has_attachments': input.hasAttachments,
        'chat.router.user_text_length': input.userText.length,
      },
    },
  });
  waitUntil(
    recordLlmCost({
      userId: input.userId,
      model,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    }),
  );
  return result.object;
}

export function pageContextAgent(
  pc: RoutingPageContext | undefined,
): ChatAgentId | null {
  if (!pc || pc.kind === 'none') return null;
  if (pc.kind === 'storage-file') return CHAT_AGENT.KNOWLEDGE;
  return null;
}

function continuityFallbackAgent(input: RoutingInput): ChatAgentId {
  // Page and previous-agent are stronger, more reliable signals than the
  // help/greeting keyword heuristics — check them first so a file page is
  // not hijacked by a keyword at the start of a short command.
  const fromPage = pageContextAgent(input.pageContext);
  if (fromPage) return fromPage;
  if (input.previousAgentId) return input.previousAgentId;
  if (looksLikeHelpQuery(input.userText)) return CHAT_AGENT.HELP;
  return CHAT_AGENT.GENERALIST;
}

function attachmentBypassAgent(_input: RoutingInput): ChatAgentId {
  return CHAT_AGENT.KNOWLEDGE;
}

function logRouting(args: {
  outcome: RoutingOutcome;
  input: RoutingInput;
  classifierFailureMessage?: string;
}): void {
  const wordCount = countWords(args.input.userText);
  const userTextPrefix = args.input.userText.trim().slice(0, 120);
  log.info('chat.router.dispatch', {
    source: args.outcome.source,
    agentId: args.outcome.agentId,
    target: args.outcome.target,
    confidence: args.outcome.confidence,
    reason: args.outcome.reason,
    previousAgentId: args.outcome.previousAgentId,
    pageKind: args.input.pageContext?.kind ?? 'none',
    hasAttachments: args.input.hasAttachments,
    wordCount,
    userTextPrefix,
    ...(args.classifierFailureMessage
      ? { classifierFailureMessage: args.classifierFailureMessage }
      : {}),
  });
}

export async function routeChatRequest(
  input: RoutingInput,
): Promise<RoutingOutcome> {
  if (isAttachmentBypass(input)) {
    const outcome: RoutingOutcome = {
      agentId: attachmentBypassAgent(input),
      source: 'bypass-attachment',
      previousAgentId: input.previousAgentId,
    };
    logRouting({ outcome, input });
    return outcome;
  }
  try {
    const decision = await classify(input);
    // No self-reported-confidence anywhere: LLM verbalized confidence is poorly
    // calibrated. Page context is fed to the classifier prompt and the model
    // honors it directly, so we trust the target; the error fallback is the
    // only guard.
    const outcome: RoutingOutcome = {
      agentId: TARGET_TO_AGENT[decision.target],
      source: 'router',
      target: decision.target,
      confidence: decision.confidence,
      reason: decision.reason,
      previousAgentId: input.previousAgentId,
    };
    logRouting({ outcome, input });
    return outcome;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const outcome: RoutingOutcome = {
      agentId: continuityFallbackAgent(input),
      source: 'fallback-error',
      previousAgentId: input.previousAgentId,
    };
    logRouting({ outcome, input, classifierFailureMessage: message });
    return outcome;
  }
}
