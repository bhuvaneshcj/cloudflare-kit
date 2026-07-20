/**
 * Core Application Module
 *
 * Provides createApp() - the main entry point for building
 * Cloudflare Worker applications with middleware support,
 * dynamic routing, path parameters, wildcards, and route grouping.
 */

import type { Middleware, RequestContext, AppOptions, Handler } from "./types";
import { handleError } from "../errors/index";
import { PluginRegistry } from "../plugins/registry";
import type { Plugin, PluginContext } from "../plugins/types";

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
 * Router instance for route groups
 */
export interface Router {
    get(path: string, ...handlers: Array<Middleware | Handler>): this;
    post(path: string, ...handlers: Array<Middleware | Handler>): this;
    put(path: string, ...handlers: Array<Middleware | Handler>): this;
    delete(path: string, ...handlers: Array<Middleware | Handler>): this;
    patch(path: string, ...handlers: Array<Middleware | Handler>): this;
    head(path: string, ...handlers: Array<Middleware | Handler>): this;
    options(path: string, ...handlers: Array<Middleware | Handler>): this;
    use(middleware: Middleware): this;
}

/**
 * Application instance
 */
export interface App {
    use(middleware: Middleware): this;
    get(path: string, ...handlers: Array<Middleware | Handler>): this;
    post(path: string, ...handlers: Array<Middleware | Handler>): this;
    put(path: string, ...handlers: Array<Middleware | Handler>): this;
    delete(path: string, ...handlers: Array<Middleware | Handler>): this;
    patch(path: string, ...handlers: Array<Middleware | Handler>): this;
    head(path: string, ...handlers: Array<Middleware | Handler>): this;
    options(path: string, ...handlers: Array<Middleware | Handler>): this;
    group(prefix: string, callback: (router: Router) => void): this;
    fetch(request: Request, env: Record<string, unknown>, executionContext: ExecutionContext): Promise<Response>;
}

/**
 * Convert a route path pattern to a RegExp and extract parameter names
 */
export function parseRoutePattern(path: string): { pattern: RegExp; paramNames: string[]; isWildcard: boolean } {
    const paramNames: string[] = [];
    let isWildcard = false;

    if (path.endsWith("/*")) {
        isWildcard = true;
        path = path.slice(0, -2);
    }

    // Escape regex specials except ":" used for params
    let patternString = path.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
        paramNames.push(name);
        return "([^/]+)";
    });

    // Capturing wildcard group for params["*"]
    if (isWildcard) {
        patternString += "(?:/(.*))?";
    }

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
 * Merge response headers from CORS / security middleware state
 */
function applyResponseHeaders(response: Response, context: RequestContext): Response {
    const corsHeaders = context.state.corsHeaders as Record<string, string> | undefined;
    const securityHeaders = context.state.securityHeaders as Record<string, string> | undefined;
    const rateLimitHeaders = context.state.rateLimitHeaders as Record<string, string> | undefined;

    const logFn = context.state._logRequest as ((status: number) => void) | undefined;
    if (typeof logFn === "function") {
        try {
            logFn(response.status);
        } catch {
            // ignore logging errors
        }
    }

    if (!corsHeaders && !securityHeaders && !rateLimitHeaders) {
        return response;
    }

    const newHeaders = new Headers(response.headers);
    for (const headers of [corsHeaders, securityHeaders, rateLimitHeaders]) {
        if (!headers) continue;
        for (const [key, value] of Object.entries(headers)) {
            newHeaders.set(key, value);
        }
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}

/**
 * Split route args into middleware + final handler
 */
function splitHandlers(handlers: Array<Middleware | Handler>): { middleware: Middleware[]; handler: Handler } {
    if (handlers.length === 0) {
        throw new Error("Route requires at least one handler");
    }
    const handler = handlers[handlers.length - 1] as Handler;
    const middleware = handlers.slice(0, -1) as Middleware[];
    return { middleware, handler };
}

/**
 * Create a new Cloudflare Worker application with dynamic routing
 */
export function createApp(options: AppOptions = {}): App {
    const middlewares: Middleware[] = [];
    const routes: Route[] = [];
    const registry = new PluginRegistry();
    let pluginsInstalled = false;

    // Register plugins from options
    if (options.plugins) {
        for (const plugin of options.plugins) {
            registry.register(plugin);
        }
    }

    async function ensurePluginsInstalled(env: Record<string, unknown>): Promise<void> {
        if (pluginsInstalled || registry.names.length === 0) {
            pluginsInstalled = true;
            return;
        }

        const noopLogger = {
            debug: () => undefined,
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
        };

        const pluginApp = {
            name: "cloudflare-kit",
            version: "2.2.0",
            config: {},
            logger: noopLogger,
            on: registry.on.bind(registry),
            emit: registry.emit.bind(registry),
            getProvider: <T>(_name: string): T | undefined => undefined,
            setProvider: <T>(_name: string, _provider: T): void => undefined,
        };

        const context: PluginContext = {
            app: pluginApp,
            config: {},
            logger: noopLogger,
            env,
        };

        await registry.installAll(context);
        pluginsInstalled = true;
    }

    function addRoute(method: string, path: string, handlers: Array<Middleware | Handler>, groupMiddleware: Middleware[] = []): void {
        const { pattern, paramNames, isWildcard } = parseRoutePattern(path);
        const { middleware: routeMiddleware, handler } = splitHandlers(handlers);

        routes.push({
            method: method.toUpperCase(),
            path,
            pattern,
            paramNames,
            handler,
            isWildcard,
            middleware: [...groupMiddleware, ...routeMiddleware],
        });

        void registry.emit("route:register", method.toUpperCase(), path);
    }

    function findRoute(method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
        const upperMethod = method.toUpperCase();

        for (const route of routes) {
            if (route.method !== upperMethod) continue;

            const match = pathname.match(route.pattern);
            if (match) {
                const params: Record<string, string> = {};
                route.paramNames.forEach((name, index) => {
                    params[name] = match[index + 1] || "";
                });

                if (route.isWildcard) {
                    const splatIndex = route.paramNames.length + 1;
                    const splat = match[splatIndex];
                    if (splat !== undefined) {
                        params["*"] = splat;
                    } else {
                        params["*"] = "";
                    }
                }

                return { route, params };
            }
        }

        return null;
    }

    function findPathWithoutMethod(pathname: string): string[] {
        const methods: string[] = [];

        for (const route of routes) {
            const match = pathname.match(route.pattern);
            if (match) {
                methods.push(route.method);
            }
        }

        return [...new Set(methods)];
    }

    function createRouter(groupPrefix: string, groupMiddleware: Middleware[]): Router {
        const routerMiddleware: Middleware[] = [];

        return {
            use(middleware: Middleware) {
                routerMiddleware.push(middleware);
                return this;
            },
            get(path: string, ...handlers: Array<Middleware | Handler>) {
                addRoute("GET", groupPrefix + path, handlers, [...groupMiddleware, ...routerMiddleware]);
                return this;
            },
            post(path: string, ...handlers: Array<Middleware | Handler>) {
                addRoute("POST", groupPrefix + path, handlers, [...groupMiddleware, ...routerMiddleware]);
                return this;
            },
            put(path: string, ...handlers: Array<Middleware | Handler>) {
                addRoute("PUT", groupPrefix + path, handlers, [...groupMiddleware, ...routerMiddleware]);
                return this;
            },
            delete(path: string, ...handlers: Array<Middleware | Handler>) {
                addRoute("DELETE", groupPrefix + path, handlers, [...groupMiddleware, ...routerMiddleware]);
                return this;
            },
            patch(path: string, ...handlers: Array<Middleware | Handler>) {
                addRoute("PATCH", groupPrefix + path, handlers, [...groupMiddleware, ...routerMiddleware]);
                return this;
            },
            head(path: string, ...handlers: Array<Middleware | Handler>) {
                addRoute("HEAD", groupPrefix + path, handlers, [...groupMiddleware, ...routerMiddleware]);
                return this;
            },
            options(path: string, ...handlers: Array<Middleware | Handler>) {
                addRoute("OPTIONS", groupPrefix + path, handlers, [...groupMiddleware, ...routerMiddleware]);
                return this;
            },
        };
    }

    async function executeMiddlewares(middlewaresToRun: Middleware[], context: RouterContext): Promise<Response | null> {
        for (const middleware of middlewaresToRun) {
            const result = await middleware(context);
            if (result instanceof Response) {
                return result;
            }
        }
        return null;
    }

    const app: App = {
        use(middleware: Middleware) {
            middlewares.push(middleware);
            void registry.emit("middleware:register", middleware.name || "anonymous");
            return this;
        },

        get(path: string, ...handlers: Array<Middleware | Handler>) {
            addRoute("GET", path, handlers);
            return this;
        },

        post(path: string, ...handlers: Array<Middleware | Handler>) {
            addRoute("POST", path, handlers);
            return this;
        },

        put(path: string, ...handlers: Array<Middleware | Handler>) {
            addRoute("PUT", path, handlers);
            return this;
        },

        delete(path: string, ...handlers: Array<Middleware | Handler>) {
            addRoute("DELETE", path, handlers);
            return this;
        },

        patch(path: string, ...handlers: Array<Middleware | Handler>) {
            addRoute("PATCH", path, handlers);
            return this;
        },

        head(path: string, ...handlers: Array<Middleware | Handler>) {
            addRoute("HEAD", path, handlers);
            return this;
        },

        options(path: string, ...handlers: Array<Middleware | Handler>) {
            addRoute("OPTIONS", path, handlers);
            return this;
        },

        group(prefix: string, callback: (router: Router) => void) {
            const router = createRouter(prefix, []);
            callback(router);
            return this;
        },

        async fetch(request: Request, env: Record<string, unknown>, executionContext: ExecutionContext): Promise<Response> {
            await ensurePluginsInstalled(env);

            const url = new URL(request.url);
            const method = request.method;
            const pathname = url.pathname;

            const match = findRoute(method, pathname);

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

            const query = parseQueryString(url);

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
                await registry.emit("request:start", context);

                const middlewareResult = await executeMiddlewares(middlewares, context);
                if (middlewareResult) {
                    const response = applyResponseHeaders(middlewareResult, context);
                    await registry.emit("request:end", context, response);
                    return response;
                }

                if (match) {
                    const routeMiddlewareResult = await executeMiddlewares(match.route.middleware, context);
                    if (routeMiddlewareResult) {
                        const response = applyResponseHeaders(routeMiddlewareResult, context);
                        await registry.emit("request:end", context, response);
                        return response;
                    }

                    const response = applyResponseHeaders(await match.route.handler(context), context);
                    await registry.emit("request:end", context, response);
                    return response;
                }

                const notFound = new Response(JSON.stringify({ error: "Not Found", path: pathname, method }), {
                    status: 404,
                    headers: { "Content-Type": "application/json" },
                });
                const response = applyResponseHeaders(notFound, context);
                await registry.emit("request:end", context, response);
                return response;
            } catch (error) {
                console.error("Handler error:", error);
                await registry.emit("request:error", context, error instanceof Error ? error : new Error(String(error)));

                if (options.onError) {
                    const custom = await options.onError(error, context);
                    return applyResponseHeaders(custom, context);
                }

                return applyResponseHeaders(handleError(error), context);
            }
        },
    };

    return app;
}

export type { Middleware, RequestContext, AppOptions, Handler } from "./types";
export type { Plugin };
