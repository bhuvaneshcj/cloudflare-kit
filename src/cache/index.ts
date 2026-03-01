/**
 * Cache Module
 *
 * Provides createCache() for KV caching operations with tags,
 * batch operations, and getOrSet pattern.
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
 * Cache tags configuration
 */
interface TagIndex {
    keys: string[];
    updatedAt: number;
}

/**
 * Create a cache service with tags, batch operations, and getOrSet
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
 * // Save with tags for invalidation
 * await cache.setWithTags('user:123', user, ['users', 'user:123'], 60 * 10);
 *
 * // Get from cache
 * const user = await cache.get('user:123');
 * if (user) {
 *   return jsonResponse(user);
 * }
 *
 * // Get or compute pattern
 * const user = await cache.getOrSet('user:123', async () => {
 *   return await fetchUserFromDB(123);
 * }, 60 * 10);
 *
 * // Batch operations
 * const users = await cache.getMany(['user:1', 'user:2', 'user:3']);
 * await cache.setMany({
 *   'user:1': user1,
 *   'user:2': user2,
 *   'user:3': user3
 * }, 60 * 10);
 *
 * // Invalidate by tag
 * await cache.invalidateByTag('users');
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

    /**
     * Get the tag index key
     */
    function getTagKey(tag: string): string {
        return `tag:${tag}`;
    }

    /**
     * Get a value from cache
     */
    async function get<T = unknown>(key: string): Promise<T | null> {
        try {
            const value = await kv.get(key, "json");
            return value as T | null;
        } catch {
            return null;
        }
    }

    /**
     * Get a string value from cache
     */
    async function getString(key: string): Promise<string | null> {
        try {
            return await kv.get(key, "text");
        } catch {
            return null;
        }
    }

    /**
     * Save a value to cache
     */
    async function set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
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
    }

    /**
     * Save a string to cache
     */
    async function setString(key: string, value: string, ttlSeconds?: number): Promise<void> {
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
    }

    /**
     * Delete a value from cache
     */
    async function deleteKey(key: string): Promise<void> {
        try {
            await kv.delete(key);
        } catch (error) {
            console.error("Cache delete error:", error);
        }
    }

    /**
     * Check if a key exists in cache
     */
    async function has(key: string): Promise<boolean> {
        try {
            const value = await kv.get(key);
            return value !== null;
        } catch {
            return false;
        }
    }

    /**
     * Get multiple values from cache
     */
    async function getMultiple<T = unknown>(keys: string[]): Promise<Record<string, T | null>> {
        const results: Record<string, T | null> = {};

        await Promise.all(
            keys.map(async (key) => {
                results[key] = await get<T>(key);
            }),
        );

        return results;
    }

    /**
     * Get value or compute and cache it
     */
    async function getOrSet<T = unknown>(key: string, compute: () => Promise<T>, ttlSeconds?: number): Promise<T> {
        const cached = await get<T>(key);

        if (cached !== null) {
            return cached;
        }

        const value = await compute();
        await set(key, value, ttlSeconds);
        return value;
    }

    /**
     * List keys with optional prefix
     */
    async function listKeys(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
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
    }

    /**
     * Get the raw KV binding for advanced usage
     */
    function getBinding(): KVNamespace {
        return kv;
    }

    /**
     * Save a value to cache with associated tags for invalidation
     */
    async function setWithTags(key: string, value: unknown, tags: string[], ttlSeconds?: number): Promise<void> {
        const ttl = ttlSeconds ?? defaultTTL;

        try {
            // Store the value
            const valuePromise = ttl
                ? kv.put(key, JSON.stringify(value), { expirationTtl: ttl })
                : kv.put(key, JSON.stringify(value));

            // Update tag indexes
            const tagPromises = tags.map(async (tag) => {
                const tagKey = getTagKey(tag);
                const existing = (await kv.get(tagKey, "json")) as TagIndex | null;

                const tagIndex: TagIndex = existing || {
                    keys: [],
                    updatedAt: Date.now(),
                };

                // Add key if not already present
                if (!tagIndex.keys.includes(key)) {
                    tagIndex.keys.push(key);
                    tagIndex.updatedAt = Date.now();

                    // Store updated tag index with same TTL as value or 30 days default
                    const tagTTL = ttl || 60 * 60 * 24 * 30;
                    await kv.put(tagKey, JSON.stringify(tagIndex), { expirationTtl: tagTTL });
                }
            });

            await Promise.all([valuePromise, ...tagPromises]);
        } catch (error) {
            console.error("Cache setWithTags error:", error);
        }
    }

    /**
     * Invalidate all keys associated with a tag
     */
    async function invalidateByTag(tag: string): Promise<void> {
        try {
            const tagKey = getTagKey(tag);
            const tagIndex = (await kv.get(tagKey, "json")) as TagIndex | null;

            if (!tagIndex || !tagIndex.keys.length) {
                return;
            }

            // Delete all keys associated with this tag
            const deletePromises = tagIndex.keys.map(async (key) => {
                await kv.delete(key);
            });

            await Promise.all(deletePromises);

            // Clear the tag index
            await kv.delete(tagKey);
        } catch (error) {
            console.error("Cache invalidateByTag error:", error);
        }
    }

    /**
     * Get multiple values from cache by keys
     */
    async function getMany(keys: string[]): Promise<Record<string, unknown>> {
        const results: Record<string, unknown> = {};

        await Promise.all(
            keys.map(async (key) => {
                try {
                    const value = await kv.get(key, "json");
                    if (value !== null) {
                        results[key] = value;
                    }
                } catch {
                    // Ignore errors for individual keys
                }
            }),
        );

        return results;
    }

    /**
     * Set multiple values in cache
     */
    async function setMany(entries: Record<string, unknown>, ttlSeconds?: number): Promise<void> {
        const ttl = ttlSeconds ?? defaultTTL;

        const promises = Object.entries(entries).map(async ([key, value]) => {
            try {
                if (ttl) {
                    await kv.put(key, JSON.stringify(value), { expirationTtl: ttl });
                } else {
                    await kv.put(key, JSON.stringify(value));
                }
            } catch (error) {
                console.error(`Cache setMany error for key ${key}:`, error);
            }
        });

        await Promise.all(promises);
    }

    return {
        /**
         * Get a value from cache
         */
        get,

        /**
         * Get a string value from cache
         */
        getString,

        /**
         * Save a value to cache
         */
        set,

        /**
         * Save a string to cache
         */
        setString,

        /**
         * Delete a value from cache
         */
        delete: deleteKey,

        /**
         * Check if a key exists in cache
         */
        has,

        /**
         * Get multiple values from cache
         */
        getMultiple,

        /**
         * Get value or compute and cache it
         */
        getOrSet,

        /**
         * List keys with optional prefix
         */
        listKeys,

        /**
         * Get the raw KV binding for advanced usage
         */
        getBinding,

        /**
         * Save a value to cache with tags for invalidation
         */
        setWithTags,

        /**
         * Invalidate all keys associated with a tag
         */
        invalidateByTag,

        /**
         * Get multiple values from cache by keys (batch get)
         */
        getMany,

        /**
         * Set multiple values in cache (batch set)
         */
        setMany,
    };
}

export type CacheService = ReturnType<typeof createCache>;
export type { KVNamespace };
