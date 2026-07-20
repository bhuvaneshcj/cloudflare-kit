/**
 * KV-based Rate Limit Store
 *
 * Distributed rate limiting using Cloudflare KV.
 *
 * IMPORTANT: KV get-modify-put is NOT strongly atomic. Concurrent requests can
 * still race. For strong consistency use a Durable Object counter. This store
 * is best-effort for multi-isolate deployments.
 */

import type { KVNamespace } from "@cloudflare/workers-types";
import type { RateLimitStore, RateLimitData } from "./types";

/**
 * Configuration for KV rate limit store
 */
export interface KVRateLimitConfig {
    binding: KVNamespace;
    prefix?: string;
}

/**
 * Create a KV-based rate limit store for production use
 *
 * Provides best-effort distributed rate limiting across Worker isolates.
 * Not strongly atomic — prefer Durable Objects when exact limits matter.
 */
export function createKVRateLimitStore(config: KVRateLimitConfig): RateLimitStore {
    const prefix = config.prefix ?? "ratelimit:";
    const kv = config.binding;

    function getKey(key: string): string {
        return `${prefix}${key}`;
    }

    return {
        async get(key: string): Promise<RateLimitData | null> {
            const data = await kv.get(getKey(key), "json");
            if (!data) return null;

            const rateData = data as RateLimitData;
            if (Date.now() > rateData.resetAt) {
                await kv.delete(getKey(key));
                return null;
            }

            return rateData;
        },

        async set(key: string, data: RateLimitData, ttlSeconds: number): Promise<void> {
            await kv.put(getKey(key), JSON.stringify(data), {
                expirationTtl: ttlSeconds,
            });
        },

        async increment(key: string): Promise<RateLimitData | null> {
            const fullKey = getKey(key);

            // Best-effort read-modify-write (not atomic across isolates)
            const current = (await kv.get(fullKey, "json")) as RateLimitData | null;
            if (!current) return null;

            if (Date.now() > current.resetAt) {
                await kv.delete(fullKey);
                return null;
            }

            current.count++;
            const ttl = Math.ceil((current.resetAt - Date.now()) / 1000);

            await kv.put(fullKey, JSON.stringify(current), {
                expirationTtl: Math.max(ttl, 1),
            });

            return current;
        },

        async reset(key: string): Promise<void> {
            await kv.delete(getKey(key));
        },
    };
}
