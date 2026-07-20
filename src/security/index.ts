/**
 * Security Module
 *
 * Provides rate limiting and validation utilities.
 */

import type { Middleware, RequestContext } from "../core/types";
import { errorResponse } from "../core/response";

export interface RateLimitOptions {
    maxRequests: number;
    windowSeconds: number;
    keyGenerator?: (request: Request) => string;
    /** Max keys retained in memory (default 10000) */
    maxKeys?: number;
}

export interface ValidationSchema {
    [key: string]: {
        type: "string" | "number" | "boolean" | "email";
        required?: boolean;
        minLength?: number;
        maxLength?: number;
        pattern?: RegExp;
    };
}

const MAX_KEYS_DEFAULT = 10_000;

/**
 * Create rate limiting middleware
 *
 * ⚠️ WARNING: This rate limiter uses an in-memory Map which has limitations:
 * - It does not share state across Cloudflare Worker isolates
 * - The map is capped (evicts expired / oldest entries) but resets on cold starts
 * - For production distributed limiting, use createRateLimiter with KV or a Durable Object
 */
export function rateLimit(options: RateLimitOptions): Middleware {
    const store = new Map<string, { count: number; resetAt: number }>();
    const maxKeys = options.maxKeys ?? MAX_KEYS_DEFAULT;

    function evictIfNeeded(): void {
        const now = Date.now();
        for (const [key, record] of store) {
            if (now > record.resetAt) {
                store.delete(key);
            }
        }
        while (store.size >= maxKeys) {
            const oldest = store.keys().next().value;
            if (oldest === undefined) break;
            store.delete(oldest);
        }
    }

    return async (context: RequestContext): Promise<Response | void> => {
        const key = options.keyGenerator ? options.keyGenerator(context.request) : context.request.headers.get("CF-Connecting-IP") || "unknown";

        const now = Date.now();
        const windowMs = options.windowSeconds * 1000;

        evictIfNeeded();

        let record = store.get(key);

        if (!record || now > record.resetAt) {
            record = { count: 0, resetAt: now + windowMs };
            store.set(key, record);
        }

        record.count++;

        const remaining = Math.max(0, options.maxRequests - record.count);
        const retryAfter = Math.ceil((record.resetAt - now) / 1000);

        if (record.count > options.maxRequests) {
            return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
                status: 429,
                headers: {
                    "Content-Type": "application/json",
                    "Retry-After": String(Math.max(retryAfter, 1)),
                    "X-RateLimit-Limit": String(options.maxRequests),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": String(Math.floor(record.resetAt / 1000)),
                },
            });
        }

        // Stash headers for successful responses via state (optional consumer)
        context.state.rateLimitHeaders = {
            "X-RateLimit-Limit": String(options.maxRequests),
            "X-RateLimit-Remaining": String(remaining),
            "X-RateLimit-Reset": String(Math.floor(record.resetAt / 1000)),
        };

        return undefined;
    };
}

/**
 * Create request validation middleware
 * @deprecated Use createValidator from "../validation" for composable schemas.
 */
export function validateRequest(schema: ValidationSchema): Middleware {
    return async (context: RequestContext): Promise<Response | void> => {
        const body = context.state.body as Record<string, unknown>;

        if (!body) {
            return errorResponse("Request body required", 400);
        }

        const errors: string[] = [];

        for (const [field, rules] of Object.entries(schema)) {
            const value = body[field];

            if (rules.required && (value === undefined || value === null || value === "")) {
                errors.push(`${field} is required`);
                continue;
            }

            if (value === undefined || value === null) {
                continue;
            }

            if (rules.type === "email") {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (typeof value !== "string" || !emailRegex.test(value)) {
                    errors.push(`${field} must be a valid email`);
                }
            } else if (rules.type === "string") {
                if (typeof value !== "string") {
                    errors.push(`${field} must be a string`);
                } else {
                    if (rules.minLength && value.length < rules.minLength) {
                        errors.push(`${field} must be at least ${rules.minLength} characters`);
                    }
                    if (rules.maxLength && value.length > rules.maxLength) {
                        errors.push(`${field} must be at most ${rules.maxLength} characters`);
                    }
                    if (rules.pattern && !rules.pattern.test(value)) {
                        errors.push(`${field} format is invalid`);
                    }
                }
            } else if (rules.type === "number") {
                if (typeof value !== "number" || isNaN(value)) {
                    errors.push(`${field} must be a number`);
                }
            } else if (rules.type === "boolean") {
                if (typeof value !== "boolean") {
                    errors.push(`${field} must be a boolean`);
                }
            }
        }

        if (errors.length > 0) {
            return errorResponse(errors.join(", "), 400);
        }
        return undefined;
    };
}
