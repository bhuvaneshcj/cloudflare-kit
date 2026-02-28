/**
 * Memory-based Rate Limit Store
 *
 * For development use only. Not suitable for production with multiple Worker instances.
 */

import type { RateLimitStore, RateLimitData } from "./types";

/**
 * Create an in-memory rate limit store
 *
 * ⚠️ WARNING: This store is for development only. Data is not shared
 * across Cloudflare Worker instances and will be lost on cold starts.
 * Use KVRateLimitStore for production.
 */
export function createMemoryRateLimitStore(): RateLimitStore {
    const store = new Map<string, RateLimitData>();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    return {
        async get(key: string): Promise<RateLimitData | null> {
            const data = store.get(key);
            if (!data) return null;

            // Check if expired
            if (Date.now() > data.resetAt) {
                store.delete(key);
                return null;
            }

            return data;
        },

        async set(key: string, data: RateLimitData, ttlSeconds: number): Promise<void> {
            store.set(key, data);

            // Clear existing timer
            const existingTimer = timers.get(key);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }

            // Set cleanup timer
            const timer = setTimeout(() => {
                store.delete(key);
                timers.delete(key);
            }, ttlSeconds * 1000);

            timers.set(key, timer);
        },

        async increment(key: string): Promise<RateLimitData | null> {
            const data = store.get(key);
            if (!data) return null;

            // Check if expired
            if (Date.now() > data.resetAt) {
                store.delete(key);
                return null;
            }

            data.count++;
            store.set(key, data);
            return data;
        },

        async reset(key: string): Promise<void> {
            store.delete(key);
            const timer = timers.get(key);
            if (timer) {
                clearTimeout(timer);
                timers.delete(key);
            }
        },
    };
}
