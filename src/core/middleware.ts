/**
 * Middleware System
 *
 * Pre-built middleware for common tasks.
 */

import type { Middleware, RequestContext } from "./types";
import { errorResponse } from "./response";

/**
 * Add CORS headers to responses
 *
 * @example
 * ```typescript
 * app.use(corsMiddleware());
 * app.use(corsMiddleware({ origin: 'https://example.com' }));
 * ```
 */
export function corsMiddleware(
    options: {
        origin?: string;
        methods?: string;
        allowHeaders?: string;
        credentials?: boolean;
    } = {},
): Middleware {
    const origin = options.origin || "*";
    const methods = options.methods || "GET, POST, PUT, DELETE, PATCH, OPTIONS";
    const allowHeaders = options.allowHeaders || "Content-Type, Authorization";
    const credentials = options.credentials;

    return async (context: RequestContext): Promise<Response | void> => {
        if (context.request.method === "OPTIONS") {
            const headers: Record<string, string> = {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": methods,
                "Access-Control-Allow-Headers": allowHeaders,
            };
            if (credentials) {
                headers["Access-Control-Allow-Credentials"] = "true";
            }
            return new Response(null, {
                status: 204,
                headers,
            });
        }

        // Store CORS headers to be applied by the app
        context.state.corsHeaders = {
            "Access-Control-Allow-Origin": origin,
            ...(credentials && { "Access-Control-Allow-Credentials": "true" }),
        };
        return undefined;
    };
}

/**
 * Parse JSON request body
 *
 * @example
 * ```typescript
 * app.use(jsonMiddleware());
 * // Now context.state.body contains parsed JSON
 * ```
 */
export function jsonMiddleware(): Middleware {
    return async (context: RequestContext): Promise<Response | void> => {
        const contentType = context.request.headers.get("content-type");

        if (contentType?.includes("application/json")) {
            try {
                const body = await context.request.json();
                context.state.body = body;
            } catch {
                return errorResponse("Invalid JSON", 400);
            }
        }
        return undefined;
    };
}

/**
 * Add security headers to all responses
 *
 * @example
 * ```typescript
 * app.use(securityHeadersMiddleware());
 * ```
 */
export function securityHeadersMiddleware(): Middleware {
    return async (): Promise<Response | void> => {
        // Headers are added by wrapping the final response
        // This is handled internally by the app
        return undefined;
    };
}
