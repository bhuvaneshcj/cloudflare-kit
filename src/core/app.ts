/**
 * Core Application Module
 *
 * Provides createApp() - the main entry point for building
 * Cloudflare Worker applications with middleware support,
 * dynamic routing, path parameters, wildcards, and route grouping.
 */

import type { Middleware, RequestContext, AppOptions, Handler } from "./types";

/**
 * Extended request context with routing information
 */
export interface RouterContext extends RequestContext {
    params: Record<string, string>;
    query: Record<string, string>;
}

/**
 * Route definition
 */
interface Route {
    method: string;
    path: string;
    pattern: RegExp;
    paramNames: string[];
    handler: Handler;
    isWildcard: boolean;
    middleware: Middleware[];
}

/**
 * Route group configuration
 */
interface RouteGroup {
    prefix: string;
    middleware: Middleware[];
    routes: Route[];
}

/**
 * Router instance for route groups
 */
export interface Router {
    get(path: string, handler: Handler): this;
    post(path: string, handler: Handler): this;
    put(path: string, handler: Handler): this;
    delete(path: string, handler: Handler): this;
    patch(path: string, handler: Handler): this;
    head(path: string, handler: Handler): this;
    options(path: string, handler: Handler): this;
    use(middleware: Middleware): this;
}

/**
 * Application instance
 */
export interface App {
    use(middleware: Middleware): this;
    get(path: string, handler: Handler): this;
    post(path: string, handler: Handler): this;
    put(path: string, handler: Handler): this;
    delete(path: string, handler: Handler): this;
    patch(path: string, handler: Handler): this;
    head(path: string, handler: Handler): this;
    options(path: string, handler: Handler): this;
    group(prefix: string, callback: (router: Router) => void): this;
    fetch(request: Request, env: Record<string, unknown>, executionContext: ExecutionContext): Promise<Response>;
}

/**
 * Convert a route path pattern to a RegExp and extract parameter names
 */
function parseRoutePattern(path: string): { pattern: RegExp; paramNames: string[]; isWildcard: boolean } {
    const paramNames: string[] = [];
    let isWildcard = false;

    // Handle wildcard routes like /static/*
    if (path.endsWith("/*")) {
        isWildcard = true;
        path = path.slice(0, -2);
    }

    // Escape special regex characters except for our parameter syntax
    let patternString = path.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\\:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
        paramNames.push(name);
        return "([^/]+)";
    });

    // For wildcards, allow anything after the path
    if (isWildcard) {
        patternString += "(?:/.*)?";
    }

    // Anchor the pattern to match the entire path
    patternString = `^${patternString}$`;

    return {
        pattern: new RegExp(patternString, "i"),
        paramNames,
        isWildcard,
    };
}

/**
 * Parse query string from URL into a record
 */
function parseQueryString(url: URL): Record<string, string> {
    const query: Record<string, string> = {};
    for (const [key, value] of url.searchParams) {
        query[key] = value;
    }
    return query;
}

/**
 * Apply CORS headers to a response if they exist
 */
function applyCorsHeaders(response: Response, corsHeaders: Record<string, string> | undefined): Response {
    if (!corsHeaders) {
        return response;
    }

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
 * Create a new Cloudflare Worker application with dynamic routing
 *
 * @example
 * ```typescript
 * const app = createApp({
 *   database: createDatabase({ binding: env.DB }),
 *   cache: createCache({ binding: env.CACHE })
 * });
 *
 * // Global middleware
 * app.use(loggingMiddleware);
 * app.use(corsMiddleware({ origin: '*' }));
 *
 * // Static routes
 * app.get('/users', getUsersHandler);
 * app.post('/users', createUserHandler);
 *
 * // Dynamic routes with parameters
 * app.get('/users/:id', getUserByIdHandler);
 * app.get('/posts/:slug/comments/:commentId', getCommentHandler);
 *
 * // Wildcard routes
 * app.get('/static/*', serveStaticHandler);
 *
 * // Route grouping with scoped middleware
 * app.group('/api/v1', (router) => {
 *   router.use(authMiddleware);
 *   router.get('/users', apiGetUsersHandler);
 *   router.post('/users', apiCreateUserHandler);
 *   router.get('/users/:id', apiGetUserHandler);
 * });
 *
 * export default app;
 * ```
 */
export function createApp(options: AppOptions = {}): App {
    const middlewares: Middleware[] = [];
    const routes: Route[] = [];
    const groups: RouteGroup[] = [];

    /**
     * Register a route
     */
    function addRoute(method: string, path: string, handler: Handler, groupMiddleware: Middleware[] = []): void {
        const { pattern, paramNames, isWildcard } = parseRoutePattern(path);

        routes.push({
            method: method.toUpperCase(),
            path,
            pattern,
            paramNames,
            handler,
            isWildcard,
            middleware: [...groupMiddleware],
        });
    }

    /**
     * Find a matching route for the given method and path
     */
    function findRoute(method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
        const upperMethod = method.toUpperCase();

        // First try exact match (backward compatibility)
        const exactRoute = routes.find((r) => r.method === upperMethod && r.path === pathname);
        if (exactRoute) {
            return { route: exactRoute, params: {} };
        }

        // Then try pattern matching
        for (const route of routes) {
            if (route.method !== upperMethod) continue;

            const match = pathname.match(route.pattern);
            if (match) {
                const params: Record<string, string> = {};
                route.paramNames.forEach((name, index) => {
                    params[name] = match[index + 1] || "";
                });

                // For wildcard routes, capture the wildcard part
                if (route.isWildcard && match[route.paramNames.length + 1]) {
                    params["*"] = match[route.paramNames.length + 1].replace(/^\//, "");
                }

                return { route, params };
            }
        }

        return null;
    }

    /**
     * Check if a path exists with any method (for 405 detection)
     */
    function findPathWithoutMethod(pathname: string): string[] {
        const methods: string[] = [];

        for (const route of routes) {
            if (route.path === pathname) {
                methods.push(route.method);
            } else {
                const match = pathname.match(route.pattern);
                if (match) {
                    methods.push(route.method);
                }
            }
        }

        return [...new Set(methods)];
    }

    /**
     * Create a router for group configuration
     */
    function createRouter(groupPrefix: string, groupMiddleware: Middleware[]): Router {
        const routerMiddleware: Middleware[] = [];

        return {
            use(middleware: Middleware) {
                routerMiddleware.push(middleware);
                return this;
            },
            get(path: string, handler: Handler) {
                addRoute("GET", groupPrefix + path, handler, [...groupMiddleware, ...routerMiddleware]);
                return this;
            },
            post(path: string, handler: Handler) {
                addRoute("POST", groupPrefix + path, handler, [...groupMiddleware, ...routerMiddleware]);
                return this;
            },
            put(path: string, handler: Handler) {
                addRoute("PUT", groupPrefix + path, handler, [...groupMiddleware, ...routerMiddleware]);
                return this;
            },
            delete(path: string, handler: Handler) {
                addRoute("DELETE", groupPrefix + path, handler, [...groupMiddleware, ...routerMiddleware]);
                return this;
            },
            patch(path: string, handler: Handler) {
                addRoute("PATCH", groupPrefix + path, handler, [...groupMiddleware, ...routerMiddleware]);
                return this;
            },
            head(path: string, handler: Handler) {
                addRoute("HEAD", groupPrefix + path, handler, [...groupMiddleware, ...routerMiddleware]);
                return this;
            },
            options(path: string, handler: Handler) {
                addRoute("OPTIONS", groupPrefix + path, handler, [...groupMiddleware, ...routerMiddleware]);
                return this;
            },
        };
    }

    /**
     * Execute middleware chain
     */
    async function executeMiddlewares(
        middlewaresToRun: Middleware[],
        context: RouterContext,
    ): Promise<Response | null> {
        for (const middleware of middlewaresToRun) {
            const result = await middleware(context);
            if (result instanceof Response) {
                return result;
            }
        }
        return null;
    }

    const app: App = {
        /**
         * Add global middleware to the application
         */
        use(middleware: Middleware) {
            middlewares.push(middleware);
            return this;
        },

        /**
         * Register a GET route
         */
        get(path: string, handler: Handler) {
            addRoute("GET", path, handler);
            return this;
        },

        /**
         * Register a POST route
         */
        post(path: string, handler: Handler) {
            addRoute("POST", path, handler);
            return this;
        },

        /**
         * Register a PUT route
         */
        put(path: string, handler: Handler) {
            addRoute("PUT", path, handler);
            return this;
        },

        /**
         * Register a DELETE route
         */
        delete(path: string, handler: Handler) {
            addRoute("DELETE", path, handler);
            return this;
        },

        /**
         * Register a PATCH route
         */
        patch(path: string, handler: Handler) {
            addRoute("PATCH", path, handler);
            return this;
        },

        /**
         * Register a HEAD route
         */
        head(path: string, handler: Handler) {
            addRoute("HEAD", path, handler);
            return this;
        },

        /**
         * Register an OPTIONS route
         */
        options(path: string, handler: Handler) {
            addRoute("OPTIONS", path, handler);
            return this;
        },

        /**
         * Create a route group with optional prefix and middleware
         */
        group(prefix: string, callback: (router: Router) => void) {
            const group: RouteGroup = {
                prefix,
                middleware: [],
                routes: [],
            };

            const router = createRouter(prefix, group.middleware);
            callback(router);

            groups.push(group);
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
            const pathname = url.pathname;

            // Find matching route
            const match = findRoute(method, pathname);

            // Check for 405 Method Not Allowed
            if (!match) {
                const availableMethods = findPathWithoutMethod(pathname);
                if (availableMethods.length > 0) {
                    return new Response(
                        JSON.stringify({
                            error: "Method Not Allowed",
                            allowed: availableMethods,
                        }),
                        {
                            status: 405,
                            headers: {
                                "Content-Type": "application/json",
                                Allow: availableMethods.join(", "),
                            },
                        },
                    );
                }
            }

            // Parse query string
            const query = parseQueryString(url);

            // Build the router context
            const context: RouterContext = {
                request,
                url,
                env,
                executionContext,
                state: {},
                params: match?.params || {},
                query,
                ...options,
            };

            try {
                // Run global middlewares
                const middlewareResult = await executeMiddlewares(middlewares, context);
                if (middlewareResult) {
                    return applyCorsHeaders(middlewareResult, context.state.corsHeaders as Record<string, string>);
                }

                // Execute route handler if found
                if (match) {
                    // Run route-specific middlewares (group middlewares)
                    const routeMiddlewareResult = await executeMiddlewares(match.route.middleware, context);
                    if (routeMiddlewareResult) {
                        return applyCorsHeaders(
                            routeMiddlewareResult,
                            context.state.corsHeaders as Record<string, string>,
                        );
                    }

                    // Run the handler
                    const response = await match.route.handler(context);
                    return applyCorsHeaders(response, context.state.corsHeaders as Record<string, string>);
                }

                // No route found - return 404
                return new Response(JSON.stringify({ error: "Not Found", path: pathname, method }), {
                    status: 404,
                    headers: { "Content-Type": "application/json" },
                });
            } catch (error) {
                console.error("Handler error:", error);
                // NEVER expose error details in production - security risk
                return new Response(
                    JSON.stringify({
                        error: "Internal Server Error",
                        requestId: crypto.randomUUID(), // For debugging without exposing internals
                    }),
                    {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    },
                );
            }
        },
    };

    return app;
}

// Re-export types
export type { Middleware, RequestContext, AppOptions, Handler } from "./types";
