/**
 * Cache Module
 *
 * Provides createCache() for KV caching operations.
 */

import type { KVNamespace } from "@cloudflare/workers-types";

export interface CacheOptions {
    binding: KVNamespace;
    defaultTTL?: number; // in seconds
}

export interface CacheEntry<T> {
    value: T;
    expiresAt?: number;
}

/**
 * Create a cache service
 *
 * @example
 * ```typescript
 * const cache = createCache({
 *   binding: env.CACHE,
 *   defaultTTL: 60 * 5 // 5 minutes default
 * });
 *
 * // Save to cache
 * await cache.set('user:123', user, 60 * 10); // 10 minutes
 *
 * // Get from cache
 * const user = await cache.get('user:123');
 * if (user) {
 *   return jsonResponse(user);
 * }
 *
 * // Delete from cache
 * await cache.delete('user:123');
 *
 * // Check if exists
 * const exists = await cache.has('user:123');
 * ```
 */
export function createCache(options: CacheOptions) {
    const kv = options.binding;
    const defaultTTL = options.defaultTTL;

    return {
        /**
         * Get a value from cache
         */
        async get<T = unknown>(key: string): Promise<T | null> {
            try {
                const value = await kv.get(key, "json");
                return value as T | null;
            } catch {
                return null;
            }
        },

        /**
         * Get a string value from cache
         */
        async getString(key: string): Promise<string | null> {
            try {
                return await kv.get(key, "text");
            } catch {
                return null;
            }
        },

        /**
         * Save a value to cache
         */
        async set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
            const ttl = ttlSeconds ?? defaultTTL;

            try {
                if (ttl) {
                    await kv.put(key, JSON.stringify(value), { expirationTtl: ttl });
                } else {
                    await kv.put(key, JSON.stringify(value));
                }
            } catch (error) {
                console.error("Cache set error:", error);
            }
        },

        /**
         * Save a string to cache
         */
        async setString(key: string, value: string, ttlSeconds?: number): Promise<void> {
            const ttl = ttlSeconds ?? defaultTTL;

            try {
                if (ttl) {
                    await kv.put(key, value, { expirationTtl: ttl });
                } else {
                    await kv.put(key, value);
                }
            } catch (error) {
                console.error("Cache set error:", error);
            }
        },

        /**
         * Delete a value from cache
         */
        async delete(key: string): Promise<void> {
            try {
                await kv.delete(key);
            } catch (error) {
                console.error("Cache delete error:", error);
            }
        },

        /**
         * Check if a key exists in cache
         */
        async has(key: string): Promise<boolean> {
            const value = await kv.get(key);
            return value !== null;
        },

        /**
         * Get multiple values from cache
         */
        async getMultiple<T = unknown>(keys: string[]): Promise<Record<string, T | null>> {
            const results: Record<string, T | null> = {};

            await Promise.all(
                keys.map(async (key) => {
                    results[key] = await this.get<T>(key);
                }),
            );

            return results;
        },

        /**
         * Get value or compute and cache it
         */
        async getOrSet<T = unknown>(key: string, compute: () => Promise<T>, ttlSeconds?: number): Promise<T> {
            const cached = await this.get<T>(key);

            if (cached !== null) {
                return cached;
            }

            const value = await compute();
            await this.set(key, value, ttlSeconds);
            return value;
        },

        /**
         * List keys with optional prefix
         */
        async listKeys(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
            keys: string[];
            cursor?: string;
        }> {
            const result = await kv.list({
                prefix: options?.prefix,
                limit: options?.limit,
                cursor: options?.cursor,
            });

            return {
                keys: result.keys.map((k) => k.name),
                cursor: result.list_complete ? undefined : result.cursor,
            };
        },

        /**
         * Get the raw KV binding for advanced usage
         */
        getBinding(): KVNamespace {
            return kv;
        },
    };
}

export type CacheService = ReturnType<typeof createCache>;
export type { KVNamespace };
