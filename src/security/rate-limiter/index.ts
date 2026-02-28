/**
 * Rate Limiter
 *
 * Enterprise-grade rate limiting with pluggable storage backends.
 */

import { RateLimitError } from "../../errors";
import type { RateLimiter, RateLimiterConfig, RateLimitResult, RateLimitData } from "./types";

export type {
    RateLimiter,
    RateLimiterConfig,
    RateLimitResult,
    RateLimitData,
    RateLimitStore,
    RateLimitMiddlewareOptions,
} from "./types";

export { createMemoryRateLimitStore } from "./memory-store";
export { createKVRateLimitStore } from "./kv-store";

/**
 * Create a rate limiter
 *
 * @example
 * ```typescript
 * // Development - Memory store
 * const devLimiter = createRateLimiter({
 *   store: createMemoryRateLimitStore(),
 *   maxRequests: 100,
 *   windowSeconds: 60
 * });
 *
 * // Production - KV store
 * const prodLimiter = createRateLimiter({
 *   store: createKVRateLimitStore({ binding: env.RATE_LIMIT_KV }),
 *   maxRequests: 100,
 *   windowSeconds: 60,
 *   keyGenerator: (req) => req.headers.get('CF-Connecting-IP') ?? 'anonymous'
 * });
 * ```
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
    const { store, maxRequests = 100, windowSeconds = 60, keyGenerator = defaultKeyGenerator, skip } = config;

    const windowMs = windowSeconds * 1000;

    function defaultKeyGenerator(request: Request): string {
        return request.headers.get("CF-Connecting-IP") ?? "anonymous";
    }

    async function getRateLimitData(key: string): Promise<RateLimitData | null> {
        const data = await store.get(key);
        if (!data) return null;

        // Check if window has expired
        if (Date.now() > data.resetAt) {
            await store.reset(key);
            return null;
        }

        return data;
    }

    async function createNewWindow(key: string): Promise<RateLimitData> {
        const data: RateLimitData = {
            count: 0,
            resetAt: Date.now() + windowMs,
            limit: maxRequests,
            window: windowSeconds,
        };

        await store.set(key, data, windowSeconds);
        return data;
    }

    return {
        async check(request: Request): Promise<RateLimitResult> {
            if (skip?.(request)) {
                return {
                    allowed: true,
                    limit: maxRequests,
                    remaining: maxRequests,
                    resetTime: Date.now() + windowMs,
                };
            }

            const key = keyGenerator(request);
            const data = await getRateLimitData(key);

            if (!data) {
                return {
                    allowed: true,
                    limit: maxRequests,
                    remaining: maxRequests,
                    resetTime: Date.now() + windowMs,
                };
            }

            const remaining = Math.max(0, maxRequests - data.count);
            const allowed = remaining > 0;

            return {
                allowed,
                limit: maxRequests,
                remaining,
                resetTime: data.resetAt,
                ...(!allowed && {
                    retryAfter: Math.ceil((data.resetAt - Date.now()) / 1000),
                }),
            };
        },

        async consume(request: Request): Promise<RateLimitResult> {
            if (skip?.(request)) {
                return {
                    allowed: true,
                    limit: maxRequests,
                    remaining: maxRequests,
                    resetTime: Date.now() + windowMs,
                };
            }

            const key = keyGenerator(request);
            let data = await getRateLimitData(key);

            if (!data) {
                data = await createNewWindow(key);
            }

            // Increment counter
            const incremented = await store.increment(key);
            if (incremented) {
                data.count = incremented.count;
            } else {
                // Race condition - create new window
                data = await createNewWindow(key);
                await store.increment(key);
                data.count = 1;
            }

            const remaining = Math.max(0, maxRequests - data.count);
            const allowed = data.count <= maxRequests;

            if (!allowed) {
                const retryAfter = Math.ceil((data.resetAt - Date.now()) / 1000);
                throw new RateLimitError(
                    config.message ?? "Too many requests",
                    retryAfter,
                    maxRequests,
                    0,
                    Math.floor(data.resetAt / 1000),
                );
            }

            return {
                allowed: true,
                limit: maxRequests,
                remaining,
                resetTime: data.resetAt,
            };
        },

        async reset(key: string): Promise<void> {
            await store.reset(key);
        },

        async status(request: Request): Promise<RateLimitResult> {
            return this.check(request);
        },
    };
}

/**
 * Create rate limit middleware
 */
export function rateLimit(limiter: RateLimiter) {
    return async (request: Request): Promise<Response | undefined> => {
        try {
            await limiter.consume(request);

            // Return undefined to continue to next middleware/handler
            // Headers will be added by the app
            return undefined;
        } catch (error) {
            if (error instanceof RateLimitError) {
                return error.toResponse();
            }
            throw error;
        }
    };
}
