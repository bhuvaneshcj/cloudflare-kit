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
    let origin = options.origin || "*";
    const methods = options.methods || "GET, POST, PUT, DELETE, PATCH, OPTIONS";
    const allowHeaders = options.allowHeaders || "Content-Type, Authorization";
    let credentials = options.credentials;

    // Spec-invalid: credentials cannot be used with wildcard origin
    if (credentials && origin === "*") {
        console.warn("[cloudflare-kit] corsMiddleware: credentials:true with origin:'*' is invalid; disabling credentials");
        credentials = false;
    }

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
 * app.use(securityHeadersMiddleware({ csp: "default-src 'self'" }));
 * ```
 */
export function securityHeadersMiddleware(
    options: {
        csp?: string;
        hsts?: boolean | string;
        frameOptions?: string;
        contentTypeOptions?: string;
        referrerPolicy?: string;
    } = {},
): Middleware {
    const headers: Record<string, string> = {
        "X-Content-Type-Options": options.contentTypeOptions ?? "nosniff",
        "X-Frame-Options": options.frameOptions ?? "DENY",
        "Referrer-Policy": options.referrerPolicy ?? "strict-origin-when-cross-origin",
        "Content-Security-Policy": options.csp ?? "default-src 'self'",
    };

    if (options.hsts !== false) {
        headers["Strict-Transport-Security"] = typeof options.hsts === "string" ? options.hsts : "max-age=31536000; includeSubDomains";
    }

    return async (context: RequestContext): Promise<Response | void> => {
        context.state.securityHeaders = {
            ...((context.state.securityHeaders as Record<string, string> | undefined) ?? {}),
            ...headers,
        };
        return undefined;
    };
}
