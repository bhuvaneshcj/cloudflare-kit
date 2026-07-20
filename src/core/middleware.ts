/**
 * Middleware System
 *
 * Pre-built middleware for common tasks.
 * Middleware returns a Response to short-circuit, or void/undefined to continue.
 * There is no Express-style next() callback.
 */

import type { Middleware, RequestContext } from "./types";
import { errorResponse } from "./response";

export type CorsOrigin = string | string[] | ((origin: string | null, request: Request) => string | null | undefined);

export interface CorsMiddlewareOptions {
    origin?: CorsOrigin;
    methods?: string | string[];
    allowHeaders?: string | string[];
    exposeHeaders?: string | string[];
    credentials?: boolean;
    maxAge?: number;
}

function asHeaderList(value: string | string[] | undefined, fallback: string): string {
    if (value === undefined) return fallback;
    return Array.isArray(value) ? value.join(", ") : value;
}

function resolveOrigin(originOption: CorsOrigin | undefined, request: Request, credentials?: boolean): string | null {
    const requestOrigin = request.headers.get("Origin");
    const configured = originOption ?? "*";

    if (typeof configured === "function") {
        return configured(requestOrigin, request) ?? null;
    }

    if (Array.isArray(configured)) {
        if (!requestOrigin) return configured[0] ?? null;
        return configured.includes(requestOrigin) ? requestOrigin : null;
    }

    if (configured === "*") {
        if (credentials) {
            // Reflect request origin when credentials are enabled
            return requestOrigin;
        }
        return "*";
    }

    return configured;
}

/**
 * Add CORS headers to responses
 */
export function corsMiddleware(options: CorsMiddlewareOptions = {}): Middleware {
    const methods = asHeaderList(options.methods, "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    const allowHeaders = asHeaderList(options.allowHeaders, "Content-Type, Authorization");
    const exposeHeaders = options.exposeHeaders ? asHeaderList(options.exposeHeaders, "") : undefined;
    let credentials = options.credentials;
    const maxAge = options.maxAge;

    if (credentials && options.origin === "*") {
        console.warn(
            "[cloudflare-kit] corsMiddleware: credentials:true with origin:'*' will reflect request Origin",
        );
    }

    return async (context: RequestContext): Promise<Response | void> => {
        const resolvedOrigin = resolveOrigin(options.origin, context.request, credentials);

        if (credentials && resolvedOrigin === "*") {
            credentials = false;
        }

        if (context.request.method === "OPTIONS") {
            const headers: Record<string, string> = {
                "Access-Control-Allow-Methods": methods,
                "Access-Control-Allow-Headers": allowHeaders,
            };
            if (resolvedOrigin) {
                headers["Access-Control-Allow-Origin"] = resolvedOrigin;
            }
            if (credentials && resolvedOrigin) {
                headers["Access-Control-Allow-Credentials"] = "true";
                headers["Vary"] = "Origin";
            }
            if (exposeHeaders) {
                headers["Access-Control-Expose-Headers"] = exposeHeaders;
            }
            if (typeof maxAge === "number") {
                headers["Access-Control-Max-Age"] = String(maxAge);
            }
            return new Response(null, { status: 204, headers });
        }

        if (resolvedOrigin) {
            context.state.corsHeaders = {
                "Access-Control-Allow-Origin": resolvedOrigin,
                ...(credentials ? { "Access-Control-Allow-Credentials": "true", Vary: "Origin" } : {}),
                ...(exposeHeaders ? { "Access-Control-Expose-Headers": exposeHeaders } : {}),
            };
        }
        return undefined;
    };
}

export interface JsonMiddlewareOptions {
    /** Max body size in bytes (default: 1MB) */
    maxSize?: number;
}

/**
 * Parse JSON request body into context.state.body
 */
export function jsonMiddleware(options: JsonMiddlewareOptions = {}): Middleware {
    const maxSize = options.maxSize ?? 1024 * 1024;

    return async (context: RequestContext): Promise<Response | void> => {
        if (context.state.body !== undefined) {
            return undefined;
        }

        const contentType = context.request.headers.get("content-type");
        if (!contentType?.includes("application/json")) {
            return undefined;
        }

        const contentLength = context.request.headers.get("content-length");
        if (contentLength && Number(contentLength) > maxSize) {
            return errorResponse(`JSON body exceeds max size of ${maxSize} bytes`, 413);
        }

        try {
            const text = await context.request.text();
            if (text.length > maxSize) {
                return errorResponse(`JSON body exceeds max size of ${maxSize} bytes`, 413);
            }
            if (!text) {
                context.state.body = undefined;
                return undefined;
            }
            context.state.body = JSON.parse(text);
        } catch {
            return errorResponse("Invalid JSON", 400);
        }
        return undefined;
    };
}

export interface SecurityHeadersOptions {
    csp?: string;
    hsts?: boolean | string;
    frameOptions?: string;
    contentTypeOptions?: string;
    referrerPolicy?: string;
    permissionsPolicy?: string;
}

/**
 * Add security headers to all responses
 */
export function securityHeadersMiddleware(options: SecurityHeadersOptions = {}): Middleware {
    const headers: Record<string, string> = {
        "X-Content-Type-Options": options.contentTypeOptions ?? "nosniff",
        "X-Frame-Options": options.frameOptions ?? "DENY",
        "Referrer-Policy": options.referrerPolicy ?? "strict-origin-when-cross-origin",
        "Content-Security-Policy": options.csp ?? "default-src 'self'",
    };

    if (options.permissionsPolicy) {
        headers["Permissions-Policy"] = options.permissionsPolicy;
    }

    if (options.hsts !== false) {
        headers["Strict-Transport-Security"] =
            typeof options.hsts === "string" ? options.hsts : "max-age=31536000; includeSubDomains";
    }

    return async (context: RequestContext): Promise<Response | void> => {
        context.state.securityHeaders = {
            ...((context.state.securityHeaders as Record<string, string> | undefined) ?? {}),
            ...headers,
        };
        return undefined;
    };
}
