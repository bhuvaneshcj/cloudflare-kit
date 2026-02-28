/**
 * Core Application Module
 *
 * Provides createApp() - the main entry point for building
 * Cloudflare Worker applications with middleware support.
 */

import type { Middleware, RequestContext, AppOptions, Handler } from "./types";

/**
 * Apply CORS headers to a response if they exist
 */
function applyCorsHeaders(response: Response, corsHeaders: Record<string, string> | undefined): Response {
    if (!corsHeaders) {
        return response;
    }

    // Clone the response with new headers
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
        newHeaders.set(key, value);
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}

/**
 * Create a new Cloudflare Worker application
 *
 * @example
 * ```typescript
 * const app = createApp({
 *   database: createDatabase({ binding: env.DB }),
 *   cache: createCache({ binding: env.CACHE })
 * });
 *
 * app.use(loggingMiddleware);
 * app.get('/users', getUsersHandler);
 *
 * export default app;
 * ```
 */
export function createApp(options: AppOptions = {}) {
    const middlewares: Middleware[] = [];
    const routes = new Map<string, Handler>();

    return {
        /**
         * Add middleware to the application
         */
        use(middleware: Middleware) {
            middlewares.push(middleware);
            return this;
        },

        /**
         * Register a GET route
         */
        get(path: string, handler: Handler) {
            routes.set(`GET:${path}`, handler);
            return this;
        },

        /**
         * Register a POST route
         */
        post(path: string, handler: Handler) {
            routes.set(`POST:${path}`, handler);
            return this;
        },

        /**
         * Register a PUT route
         */
        put(path: string, handler: Handler) {
            routes.set(`PUT:${path}`, handler);
            return this;
        },

        /**
         * Register a DELETE route
         */
        delete(path: string, handler: Handler) {
            routes.set(`DELETE:${path}`, handler);
            return this;
        },

        /**
         * Register a PATCH route
         */
        patch(path: string, handler: Handler) {
            routes.set(`PATCH:${path}`, handler);
            return this;
        },

        /**
         * Handle incoming requests (called by Cloudflare Workers)
         */
        async fetch(
            request: Request,
            env: Record<string, unknown>,
            executionContext: ExecutionContext,
        ): Promise<Response> {
            const url = new URL(request.url);
            const method = request.method;
            const key = `${method}:${url.pathname}`;

            const context: RequestContext = {
                request,
                url,
                env,
                executionContext,
                state: {},
                ...options,
            };

            // Run middlewares
            for (const middleware of middlewares) {
                const result = await middleware(context);
                if (result instanceof Response) {
                    // Apply CORS headers if they were set by middleware
                    return applyCorsHeaders(result, context.state.corsHeaders as Record<string, string> | undefined);
                }
            }

            // Find and execute handler
            const handler = routes.get(key);
            if (handler) {
                try {
                    const response = await handler(context);
                    // Apply CORS headers if they were set by middleware
                    return applyCorsHeaders(response, context.state.corsHeaders as Record<string, string> | undefined);
                } catch (error) {
                    console.error("Handler error:", error);
                    return new Response(JSON.stringify({ error: "Internal server error" }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            }

            return new Response("Not Found", { status: 404 });
        },
    };
}

// Re-export types
export type { Middleware, RequestContext, AppOptions, Handler } from "./types";
