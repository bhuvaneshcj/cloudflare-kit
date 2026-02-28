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

/**
 * Create rate limiting middleware
 *
 * ⚠️ WARNING: This rate limiter uses an in-memory Map which has limitations:
 * - It does not share state across Cloudflare Worker isolates (each request may hit a different isolate)
 * - The map grows unbounded and resets on cold starts
 * - For production use, consider using KV or D1 for distributed rate limiting
 *
 * @example
 * ```typescript
 * app.use(rateLimit({
 *   maxRequests: 100,
 *   windowSeconds: 60
 * }));
 * ```
 */
export function rateLimit(options: RateLimitOptions): Middleware {
    const store = new Map<string, { count: number; resetAt: number }>();

    return async (context: RequestContext): Promise<Response | void> => {
        const key = options.keyGenerator
            ? options.keyGenerator(context.request)
            : context.request.headers.get("CF-Connecting-IP") || "unknown";

        const now = Date.now();
        const windowMs = options.windowSeconds * 1000;

        let record = store.get(key);

        if (!record || now > record.resetAt) {
            record = { count: 0, resetAt: now + windowMs };
            store.set(key, record);
        }

        record.count++;

        if (record.count > options.maxRequests) {
            return errorResponse("Rate limit exceeded", 429);
        }
        return undefined;
    };
}

/**
 * Create request validation middleware
 *
 * @example
 * ```typescript
 * app.use(validateRequest({
 *   email: { type: 'email', required: true },
 *   name: { type: 'string', required: true, minLength: 2, maxLength: 100 }
 * }));
 * ```
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

            // Check required
            if (rules.required && (value === undefined || value === null || value === "")) {
                errors.push(`${field} is required`);
                continue;
            }

            if (value === undefined || value === null) {
                continue;
            }

            // Type validation
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

// Types are already exported via interfaces above
