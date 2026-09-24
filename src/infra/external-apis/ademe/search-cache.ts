import 'server-only';

import { dpeSearchCacheKey } from '@/core/ademe/search-cache-key';
import type { DpeRecord, DpeSearchFilter } from '@/core/ademe/types';
import { getRedisClient } from '@/infra/external-apis/redis/client';
import { log } from '@/shared/logger';

export type CachedSearch = {
  records: DpeRecord[];
  total: number;
  truncated: boolean;
};

// why: une entree vit six heures, donc elle survit a un deploiement. Une
// entree ecrite avant un changement de forme de DpeRecord ou de CachedSearch
// serait relue telle quelle et rejetee par le client : changer la forme
// impose d'incrementer cette version.
const REDIS_KEY_PREFIX = 'app:ademe-search:v2';
const TTL_SECONDS = 6 * 60 * 60;

// why: sans Redis — en local, ou si Upstash n'est pas configure — un repli en
// memoire garde le benefice sur une meme instance. Il est plafonne : une Map
// non bornee dans une fonction serverless est une fuite.
const MAX_LOCAL_ENTRIES = 200;
const localCache = new Map<
  string,
  { value: CachedSearch; expiresAt: number }
>();

function redisKey(filter: DpeSearchFilter): string {
  return `${REDIS_KEY_PREFIX}:${dpeSearchCacheKey(filter)}`;
}

function readLocal(key: string, now: number): CachedSearch | null {
  const entry = localCache.get(key);
  if (entry === undefined) return null;
  if (entry.expiresAt <= now) {
    localCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeLocal(key: string, value: CachedSearch, now: number): void {
  if (localCache.size >= MAX_LOCAL_ENTRIES) {
    const oldest = localCache.keys().next();
    if (!oldest.done) localCache.delete(oldest.value);
  }
  localCache.set(key, { value, expiresAt: now + TTL_SECONDS * 1000 });
}

// why: le repli en memoire vit au niveau du module, donc il traverse les tests
// d'un meme fichier. Sans cette couture, une assertion sur les appels reseau
// lirait l'entree posee par le test precedent.
export function clearLocalSearchCache(): void {
  localCache.clear();
}

export async function readCachedSearch(
  filter: DpeSearchFilter,
  now: number,
): Promise<CachedSearch | null> {
  const key = redisKey(filter);
  const redis = getRedisClient();
  if (redis === null) return readLocal(key, now);

  try {
    const cached = await redis.get<CachedSearch>(key);
    return cached ?? null;
  } catch (e) {
    // why: le cache est un confort. Une panne Redis ne doit jamais empecher
    // une recherche d'aboutir.
    log.warn('ademe.cache.read_failed', {
      reason: e instanceof Error ? e.message : 'unknown',
    });
    return null;
  }
}

export async function writeCachedSearch(
  filter: DpeSearchFilter,
  value: CachedSearch,
  now: number,
): Promise<void> {
  const key = redisKey(filter);
  const redis = getRedisClient();
  if (redis === null) {
    writeLocal(key, value, now);
    return;
  }

  try {
    await redis.set(key, value, { ex: TTL_SECONDS });
  } catch (e) {
    log.warn('ademe.cache.write_failed', {
      reason: e instanceof Error ? e.message : 'unknown',
    });
  }
}
