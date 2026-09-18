import 'server-only';

import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import { Memory } from '@mastra/memory';
import { Observability } from '@mastra/observability';
import { PgVector, PostgresStore } from '@mastra/pg';
import { PosthogExporter } from '@mastra/posthog';
import { CHAT_AGENT, type ChatAgentId } from '@/core/agents/agent-ids';
import { WorkingMemoryJsonSchema } from '@/core/agents/working-memory';
import { env } from '@/shared/env';
import { agentDefinitions } from './agent-definitions';
import { stripNonImageFilePartsProcessor } from './strip-non-image-files-processor';

const e = env();

const MASTRA_PG_POOL_MAX = 3;
const MASTRA_PG_IDLE_TIMEOUT_MS = 10_000;

type MastraSingletons = {
  storage: PostgresStore;
  memory: Memory;
};

const globalForMastra = globalThis as unknown as {
  __appMastra?: MastraSingletons;
};

function buildMastraSingletons(): MastraSingletons {
  const storage = new PostgresStore({
    id: 'app-storage',
    connectionString: e.DATABASE_URL,
    max: MASTRA_PG_POOL_MAX,
    idleTimeoutMillis: MASTRA_PG_IDLE_TIMEOUT_MS,
  });
  const memoryInstance = new Memory({
    storage,
    vector: new PgVector({
      id: 'app-vector',
      connectionString: e.DATABASE_URL,
      max: MASTRA_PG_POOL_MAX,
      idleTimeoutMillis: MASTRA_PG_IDLE_TIMEOUT_MS,
    }),
    embedder: new ModelRouterEmbeddingModel(`openai/text-embedding-3-small`),
    options: {
      lastMessages: 20,
      workingMemory: {
        enabled: true,
        schema: WorkingMemoryJsonSchema,
      },
      semanticRecall: {
        topK: 5,
        messageRange: 2,
      },
      generateTitle: true,
    },
  });
  return { storage, memory: memoryInstance };
}

const singletons = globalForMastra.__appMastra ?? buildMastraSingletons();
if (e.NODE_ENV !== 'production') {
  globalForMastra.__appMastra = singletons;
}

export const mastraStorage = singletons.storage;
export const memory = singletons.memory;

const HISTORY_TOKEN_LIMIT = 12_000;

const chatHistoryTokenLimiter = new TokenLimiterProcessor({
  limit: HISTORY_TOKEN_LIMIT,
  strategy: 'truncate',
  countMode: 'cumulative',
});

function buildAgent(id: ChatAgentId): Agent {
  const def = agentDefinitions[id];
  return new Agent({
    id,
    name: def.name,
    instructions: def.instructions,
    inputProcessors: [stripNonImageFilePartsProcessor, chatHistoryTokenLimiter],
    model: def.model,
    memory,
    tools: def.tools,
  });
}

const agents = {
  [CHAT_AGENT.GENERALIST]: buildAgent(CHAT_AGENT.GENERALIST),
  [CHAT_AGENT.KNOWLEDGE]: buildAgent(CHAT_AGENT.KNOWLEDGE),
  [CHAT_AGENT.HELP]: buildAgent(CHAT_AGENT.HELP),
};

const posthogKey = e.NEXT_PUBLIC_POSTHOG_KEY;

export const mastra = new Mastra({
  agents,
  ...(posthogKey
    ? {
        observability: new Observability({
          configs: {
            posthog: {
              serviceName: 'startup-boilerplate',
              exporters: [
                new PosthogExporter({
                  apiKey: posthogKey,
                  host: e.NEXT_PUBLIC_POSTHOG_HOST,
                }),
              ],
            },
          },
        }),
      }
    : {}),
});

export const CHAT_AGENT_ID = CHAT_AGENT.GENERALIST;
