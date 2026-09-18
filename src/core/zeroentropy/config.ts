export const ZEROENTROPY_LATENCY_MODE = {
  FAST: 'fast',
  SLOW: 'slow',
} as const;
export type ZeroEntropyLatencyMode =
  (typeof ZEROENTROPY_LATENCY_MODE)[keyof typeof ZEROENTROPY_LATENCY_MODE];

export const ZEROENTROPY_RERANKER_MODEL = {
  ZERANK_2: 'zerank-2',
  ZERANK_1: 'zerank-1',
  ZERANK_1_SMALL: 'zerank-1-small',
} as const;
export type ZeroEntropyRerankerModel =
  (typeof ZEROENTROPY_RERANKER_MODEL)[keyof typeof ZEROENTROPY_RERANKER_MODEL];

export const ZEROENTROPY_CONFIG = {
  rateLimitMaxRetries: 3,
  rateLimitBaseDelayMs: 1000,
  requestTimeoutMs: 30_000,
  concurrency: 10,
  failedSyncMaxAttempts: 10,
  failedSyncBaseDelayMs: 1_000,
  failedSyncMaxDelayMs: 60 * 60 * 1000,
  circuitBreakerFailureThreshold: 5,
  circuitBreakerOpenDurationMs: 30_000,
  circuitBreakerWindowMs: 60_000,
  retrieval: {
    defaultReranker: ZEROENTROPY_RERANKER_MODEL.ZERANK_2,
    defaultLatencyMode: ZEROENTROPY_LATENCY_MODE.FAST,
    defaultPreciseResponses: true,
    defaultMinScore: 0.3,
  },
} as const;

export type ZeroEntropyConfig = typeof ZEROENTROPY_CONFIG;
