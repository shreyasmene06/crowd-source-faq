/**
 * Redis Semantic Cache — Upstash Redis (serverless-compatible)
 *
 * Caches search query embeddings and results to avoid recomputing on repeat queries.
 * FAQ systems typically see 80-95% cache hit rates on queries.
 *
 * Setup: Create a free Upstash Redis database at https://upstash.com
 * Then set REDIS_URL and REDIS_TOKEN in your .env
 */

import { Redis } from '@upstash/redis';

// Lazy singleton — only initialized when REDIS_URL is set
let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!process.env.REDIS_URL || !process.env.REDIS_TOKEN) {
    return null;
  }
  if (!redis) {
    redis = new Redis({
      url: process.env.REDIS_URL,
      token: process.env.REDIS_TOKEN,
    });
  }
  return redis;
}

/** Simple hash for cache keys — deterministic, short */
function hashQuery(text: string): string {
  let hash = 0;
  const normalized = text.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0; // int32
  }
  return `sc:${hash.toString(36)}`;
}

// TTL in seconds — 1 hour for search results is fine (FAQ data doesn't change often)
const RESULT_TTL = 60 * 60;

/**
 * Try to get cached search results for a query.
 * Returns null on cache miss (including when Redis is not configured).
 */
export async function getCachedResults(
  query: string
): Promise<{ results: unknown[] } | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    const key = `result:${hashQuery(query)}`;
    const cached = await client.get<{ results: unknown[] }>(key);
    if (cached) {
      console.log(`[cache HIT] "${query.slice(0, 40)}"`);
    }
    return cached ?? null;
  } catch (err) {
    console.warn('[cache] get failed:', (err as Error).message);
    return null;
  }
}

/**
 * Store search results in cache. Silently fails if Redis is unavailable.
 */
export async function setCachedResults(
  query: string,
  results: unknown[]
): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    const key = `result:${hashQuery(query)}`;
    await client.set(key, { results }, { ex: RESULT_TTL });
    console.log(`[cache SET] "${query.slice(0, 40)}"`);
  } catch (err) {
    console.warn('[cache] set failed:', (err as Error).message);
  }
}

/**
 * Invalidate all cached search results. Call this when FAQ data changes significantly.
 */
export async function invalidateCache(): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    const keys = await client.keys('result:*');
    if (keys.length > 0) {
      await client.del(...keys);
      console.log(`[cache] invalidated ${keys.length} entries`);
    }
  } catch (err) {
    console.warn('[cache] invalidate failed:', (err as Error).message);
  }
}

export const cacheAvailable = (): boolean => getRedis() !== null;
