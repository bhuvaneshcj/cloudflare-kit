/**
 * Rate Limiter Types
 *
 * Pluggable rate limiting with support for multiple storage backends.
 */

import type { RateLimitError } from "../../errors";

/**
 * Rate limit store interface
 * Implement this to create custom storage backends
 */
export interface RateLimitStore {
    /**
     * Get the current rate limit data for a key
     */
    get(key: string): Promise<RateLimitData | null>;

    /**
     * Set rate limit data with TTL
     */
    set(key: string, data: RateLimitData, ttlSeconds: number): Promise<void>;

    /**
     * Increment the counter atomically
     * Returns the new data or null if key doesn't exist
     */
    increment(key: string): Promise<RateLimitData | null>;

    /**
     * Reset the counter for a key
     */
    reset(key: string): Promise<void>;
}

/**
 * Rate limit data structure
 */
export interface RateLimitData {
    count: number;
    resetAt: number;
    limit: number;
    window: number;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
}

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
    /**
     * Storage backend
     */
    store: RateLimitStore;

    /**
     * Maximum number of requests allowed in the window
     * @default 100
     */
    maxRequests?: number;

    /**
     * Time window in seconds
     * @default 60
     */
    windowSeconds?: number;

    /**
     * Function to generate the rate limit key from the request
     * @default Uses CF-Connecting-IP header or 'unknown'
     */
    keyGenerator?: (request: Request) => string;

    /**
     * Skip rate limiting for certain requests
     */
    skip?: (request: Request) => boolean;

    /**
     * Custom error message
     */
    message?: string;
}

/**
 * Rate limiter interface
 */
export interface RateLimiter {
    /**
     * Check if a request is allowed
     */
    check(request: Request): Promise<RateLimitResult>;

    /**
     * Consume a request (increment counter)
     * Throws RateLimitError if limit exceeded
     */
    consume(request: Request): Promise<RateLimitResult>;

    /**
     * Reset rate limit for a key
     */
    reset(key: string): Promise<void>;

    /**
     * Get current status without consuming
     */
    status(request: Request): Promise<RateLimitResult>;
}

/**
 * Middleware options for rate limiting
 */
export interface RateLimitMiddlewareOptions {
    limiter: RateLimiter;
    onError?: (error: RateLimitError) => Response | Promise<Response>;
}
