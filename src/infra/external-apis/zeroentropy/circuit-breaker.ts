import 'server-only';

import { ZEROENTROPY_CONFIG } from '@/core/zeroentropy/config';
import type {
  CircuitState,
  ICircuitBreaker,
} from '@/core/zeroentropy/ports/circuit-breaker.port';
import { getRedisClient } from '@/infra/external-apis/redis/client';
import { log } from '@/shared/logger';

const REDIS_KEY_PREFIX = 'zeroentropy:circuit';
const REDIS_TTL_SECONDS = 300;

const KEYS = {
  state: `${REDIS_KEY_PREFIX}:state`,
  failureCount: `${REDIS_KEY_PREFIX}:failures`,
  lastFailureTime: `${REDIS_KEY_PREFIX}:last_failure`,
};

let fallbackState: CircuitState = 'closed';
let fallbackFailureCount = 0;
let fallbackLastFailureTime = 0;

async function getStateFromRedis(): Promise<{
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
} | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const [state, failureCount, lastFailureTime] = await Promise.all([
      redis.get<CircuitState>(KEYS.state),
      redis.get<number>(KEYS.failureCount),
      redis.get<number>(KEYS.lastFailureTime),
    ]);
    return {
      state: state ?? 'closed',
      failureCount: failureCount ?? 0,
      lastFailureTime: lastFailureTime ?? 0,
    };
  } catch (error) {
    log.warn('Circuit breaker: Redis read failed, using fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function setStateInRedis(
  state: CircuitState,
  failureCount: number,
  lastFailureTime: number,
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    await Promise.all([
      redis.set(KEYS.state, state, { ex: REDIS_TTL_SECONDS }),
      redis.set(KEYS.failureCount, failureCount, { ex: REDIS_TTL_SECONDS }),
      redis.set(KEYS.lastFailureTime, lastFailureTime, {
        ex: REDIS_TTL_SECONDS,
      }),
    ]);
    return true;
  } catch (error) {
    log.warn('Circuit breaker: Redis write failed, using fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function isOpen(): Promise<boolean> {
  const redisState = await getStateFromRedis();

  if (redisState) {
    if (redisState.state === 'open') {
      if (
        Date.now() - redisState.lastFailureTime >=
        ZEROENTROPY_CONFIG.circuitBreakerOpenDurationMs
      ) {
        await setStateInRedis(
          'half-open',
          redisState.failureCount,
          redisState.lastFailureTime,
        );
        return false;
      }
      return true;
    }
    return false;
  }

  if (fallbackState === 'open') {
    if (
      Date.now() - fallbackLastFailureTime >=
      ZEROENTROPY_CONFIG.circuitBreakerOpenDurationMs
    ) {
      fallbackState = 'half-open';
      return false;
    }
    return true;
  }
  return false;
}

async function recordSuccess(): Promise<void> {
  const redisState = await getStateFromRedis();

  if (redisState) {
    if (redisState.state === 'half-open') {
      await setStateInRedis('closed', 0, redisState.lastFailureTime);
      log.info('ZeroEntropy circuit breaker closed (Redis)');
    }
    return;
  }

  if (fallbackState === 'half-open') {
    fallbackState = 'closed';
    fallbackFailureCount = 0;
    log.info('ZeroEntropy circuit breaker closed (fallback)');
  }
}

async function recordFailure(): Promise<void> {
  const now = Date.now();
  const redisState = await getStateFromRedis();

  if (redisState) {
    const newFailureCount = redisState.failureCount + 1;
    let newState: CircuitState = redisState.state;

    if (
      newFailureCount >= ZEROENTROPY_CONFIG.circuitBreakerFailureThreshold &&
      redisState.state !== 'open'
    ) {
      newState = 'open';
      log.warn('ZeroEntropy circuit breaker opened (Redis)', {
        failureCount: newFailureCount,
      });
    }
    await setStateInRedis(newState, newFailureCount, now);
    return;
  }

  fallbackFailureCount += 1;
  fallbackLastFailureTime = now;

  if (
    fallbackFailureCount >= ZEROENTROPY_CONFIG.circuitBreakerFailureThreshold &&
    fallbackState !== 'open'
  ) {
    fallbackState = 'open';
    log.warn('ZeroEntropy circuit breaker opened (fallback)', {
      failureCount: fallbackFailureCount,
    });
  }
}

async function getState(): Promise<CircuitState> {
  const redisState = await getStateFromRedis();
  return redisState?.state ?? fallbackState;
}

async function reset(): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await Promise.all([
        redis.del(KEYS.state),
        redis.del(KEYS.failureCount),
        redis.del(KEYS.lastFailureTime),
      ]);
    } catch (error) {
      log.warn('Circuit breaker: Redis reset failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  fallbackState = 'closed';
  fallbackFailureCount = 0;
  fallbackLastFailureTime = 0;
}

export const zeroEntropyCircuitBreaker: ICircuitBreaker = {
  isOpen,
  recordSuccess,
  recordFailure,
  getState,
  reset,
};
