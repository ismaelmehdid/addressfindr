import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { type AppError, rateLimited } from '@/core/errors';
import {
  microCents,
  usdCost,
  usdFromMicroCents,
} from '@/core/rate-limit/llm-cost-config';
import { getRedisClient } from '@/infra/external-apis/redis/client';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

const DAY_TTL_SECONDS = 60 * 60 * 26;
const SOFT_THRESHOLD_RATIO = 0.8;

function dayKey(userId: string): string {
  const yyyymmdd = new Date().toISOString().slice(0, 10);
  return `app:llm-cost:${yyyymmdd}:${userId}`;
}

export type LlmBudgetStatus = {
  readonly allowed: boolean;
  readonly softWarning: boolean;
  readonly usedUsd: number;
  readonly limitUsd: number;
  readonly percentUsed: number;
};

export async function checkLlmBudget(args: {
  userId: string;
}): Promise<Result<LlmBudgetStatus, AppError>> {
  const e = env();
  if (e.NODE_ENV === 'development') {
    return ok({
      allowed: true,
      softWarning: false,
      usedUsd: 0,
      limitUsd: e.LLM_DAILY_BUDGET_USD_PER_USER,
      percentUsed: 0,
    });
  }
  const redis = getRedisClient();
  if (!redis) {
    return ok({
      allowed: true,
      softWarning: false,
      usedUsd: 0,
      limitUsd: e.LLM_DAILY_BUDGET_USD_PER_USER,
      percentUsed: 0,
    });
  }

  const key = dayKey(args.userId);
  try {
    const rawValue = await redis.get<string | number | null>(key);
    const usedMicroCents =
      typeof rawValue === 'number'
        ? rawValue
        : typeof rawValue === 'string'
          ? Number.parseInt(rawValue, 10) || 0
          : 0;
    const usedUsd = usdFromMicroCents(usedMicroCents);
    const limitUsd = e.LLM_DAILY_BUDGET_USD_PER_USER;
    const percentUsed = limitUsd > 0 ? usedUsd / limitUsd : 0;
    const allowed = usedUsd < limitUsd;
    if (!allowed) {
      return err(
        rateLimited(
          `Daily LLM budget exceeded: $${usedUsd.toFixed(3)} of $${limitUsd.toFixed(2)}.`,
        ),
      );
    }
    return ok({
      allowed,
      softWarning: percentUsed >= SOFT_THRESHOLD_RATIO,
      usedUsd,
      limitUsd,
      percentUsed,
    });
  } catch (e) {
    log.warn('llm_cost.check_failed_open', {
      userId: args.userId,
      message: e instanceof Error ? e.message : 'unknown',
    });
    return ok({
      allowed: true,
      softWarning: false,
      usedUsd: 0,
      limitUsd: env().LLM_DAILY_BUDGET_USD_PER_USER,
      percentUsed: 0,
    });
  }
}

export async function recordLlmCost(args: {
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  if (env().NODE_ENV === 'development') return;
  const redis = getRedisClient();
  if (!redis) return;
  const cost = usdCost(args.model, args.inputTokens, args.outputTokens);
  if (cost <= 0) return;
  const increment = microCents(cost);
  const key = dayKey(args.userId);
  try {
    const newTotal = await redis.incrby(key, increment);
    if (newTotal === increment) {
      await redis.expire(key, DAY_TTL_SECONDS);
    }
    log.info('llm_cost.recorded', {
      userId: args.userId,
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costUsd: cost,
      totalUsdToday: usdFromMicroCents(newTotal),
    });
  } catch (e) {
    log.warn('llm_cost.record_failed', {
      userId: args.userId,
      model: args.model,
      message: e instanceof Error ? e.message : 'unknown',
    });
  }
}
