/**
 * KV-based Rate Limit Store
 *
 * Production-ready distributed rate limiting using Cloudflare KV.
 */

import type { RateLimitStore, RateLimitData } from "./types";

/**
 * Configuration for KV rate limit store
 */
export interface KVRateLimitConfig {
    /**
     * KV namespace binding
     */
    binding: KVNamespace;

    /**
     * Key prefix for rate limit entries
     * @default 'ratelimit:'
     */
    prefix?: string;
}

/**
 * Create a KV-based rate limit store for production use
 *
 * This store provides distributed rate limiting across all Cloudflare
 * Worker instances. Use this in production environments.
 *
 * @example
 * ```typescript
 * const store = createKVRateLimitStore({
 *   binding: env.RATE_LIMIT_KV,
 *   prefix: 'api:'
 * });
 *
 * const limiter = createRateLimiter({
 *   store,
 *   maxRequests: 100,
 *   windowSeconds: 60
 * });
 * ```
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

            // Validate the data structure
            const rateData = data as RateLimitData;
            if (Date.now() > rateData.resetAt) {
                // Data expired, clean it up
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

            // Get current value
            const current = (await kv.get(fullKey, "json")) as RateLimitData | null;
            if (!current) return null;

            // Check if expired
            if (Date.now() > current.resetAt) {
                await kv.delete(fullKey);
                return null;
            }

            // Increment and update
            // Note: This is not atomic. For true atomic increments,
            // consider using D1 or a counter service
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
