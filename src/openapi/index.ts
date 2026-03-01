/**
 * OpenAPI Module
 *
 * Provides OpenAPI 3.0 spec generation and Swagger UI serving.
 */

import type { App } from "../core/app";
import type { Handler, Middleware } from "../core/types";

/**
 * OpenAPI specification version
 */
export interface OpenAPIInfo {
    title: string;
    version: string;
    description?: string;
}

/**
 * OpenAPI server configuration
 */
export interface OpenAPIServer {
    url: string;
    description?: string;
}

/**
 * OpenAPI schema definition
 */
export interface OpenAPISchema {
    type?: string;
    format?: string;
    description?: string;
    properties?: Record<string, OpenAPISchema>;
    required?: string[];
    items?: OpenAPISchema;
    enum?: (string | number)[];
    example?: unknown;
}

/**
 * OpenAPI parameter definition
 */
export interface OpenAPIParameter {
    name: string;
    in: "query" | "path" | "header" | "cookie";
    description?: string;
    required?: boolean;
    schema?: OpenAPISchema;
    example?: unknown;
}

/**
 * OpenAPI request body
 */
export interface OpenAPIRequestBody {
    description?: string;
    required?: boolean;
    content: Record<string, { schema: OpenAPISchema; example?: unknown }>;
}

/**
 * OpenAPI response
 */
export interface OpenAPIResponse {
    description: string;
    content?: Record<string, { schema: OpenAPISchema; example?: unknown }>;
    headers?: Record<string, { description?: string; schema?: OpenAPISchema }>;
}

/**
 * Route metadata for OpenAPI
 */
export interface RouteMetadata {
    /** Route summary */
    summary?: string;
    /** Detailed description */
    description?: string;
    /** Tags for grouping */
    tags?: string[];
    /** Request body schema */
    requestBody?: OpenAPIRequestBody;
    /** Response schemas by status code */
    responses: Record<string, OpenAPIResponse>;
    /** Path and query parameters */
    parameters?: OpenAPIParameter[];
    /** Operation ID */
    operationId?: string;
    /** Whether authentication is required */
    security?: Array<Record<string, string[]>>;
}

/**
 * OpenAPI options
 */
export interface OpenAPIOptions {
    /** API title */
    title: string;
    /** API version */
    version: string;
    /** API description */
    description?: string;
    /** Server URLs */
    servers?: OpenAPIServer[];
}

/**
 * OpenAPI specification object
 */
export interface OpenAPISpec {
    openapi: string;
    info: OpenAPIInfo;
    servers?: OpenAPIServer[];
    paths: Record<string, Record<string, RouteMetadata>>;
    components?: {
        schemas?: Record<string, OpenAPISchema>;
        securitySchemes?: Record<string, unknown>;
    };
}

/**
 * Handler with OpenAPI metadata
 */
interface RouteWithMetadata {
    method: string;
    path: string;
    metadata: RouteMetadata;
}

/**
 * OpenAPI service
 */
export interface OpenAPIService {
    /** Generate OpenAPI spec */
    generate(): OpenAPISpec;
    /** Serve spec and Swagger UI middleware */
    serve(path?: string): Middleware;
    /** Attach to an app to auto-collect routes */
    attach(app: App): void;
}

/**
 * Create OpenAPI service
 *
 * @example
 * ```typescript
 * const openapi = createOpenAPI({
 *   title: 'My API',
 *   version: '1.0.0',
 *   description: 'A sample API',
 *   servers: [{ url: 'https://api.example.com' }]
 * });
 *
 * const app = createApp();
 * openapi.attach(app);
 *
 * // Define routes with metadata
 * app.get('/users', defineRoute({
 *   summary: 'List users',
 *   tags: ['Users'],
 *   responses: {
 *     '200': { description: 'List of users' }
 *   }
 * }), listUsersHandler);
 *
 * // Serve OpenAPI spec and Swagger UI
 * app.use(openapi.serve());
 * ```
 */
export function createOpenAPI(options: OpenAPIOptions): OpenAPIService {
    const routes: RouteWithMetadata[] = [];

    /**
     * Register a route with metadata
     */
    function registerRoute(method: string, path: string, metadata: RouteMetadata): void {
        routes.push({ method: method.toLowerCase(), path, metadata });
    }

    /**
     * Generate OpenAPI spec
     */
    function generate(): OpenAPISpec {
        const paths: Record<string, Record<string, RouteMetadata>> = {};

        for (const route of routes) {
            // Convert path params from :id to {id} format
            const openApiPath = route.path.replace(/:([^/]+)/g, "{$1}");

            if (!paths[openApiPath]) {
                paths[openApiPath] = {};
            }

            paths[openApiPath][route.method] = route.metadata;
        }

        return {
            openapi: "3.0.3",
            info: {
                title: options.title,
                version: options.version,
                description: options.description,
            },
            servers: options.servers,
            paths,
            components: {
                schemas: {},
                securitySchemes: {
                    bearerAuth: {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "JWT",
                    },
                },
            },
        };
    }

    /**
     * Create middleware to serve OpenAPI spec and Swagger UI
     */
    function serve(basePath = ""): Middleware {
        const specPath = `${basePath}/openapi.json`;
        const docsPath = `${basePath}/docs`;

        return async (context) => {
            const url = new URL(context.request.url);

            // Serve OpenAPI spec
            if (url.pathname === specPath) {
                const spec = generate();
                return new Response(JSON.stringify(spec, null, 2), {
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    },
                });
            }

            // Serve Swagger UI
            if (url.pathname === docsPath || url.pathname === `${docsPath}/`) {
                return new Response(getSwaggerUI(specPath), {
                    headers: {
                        "Content-Type": "text/html",
                    },
                });
            }

            // Pass through if no match
            return;
        };
    }

    /**
     * Attach to an app to intercept route registration
     */
    function attach(app: App): void {
        // Store original methods
        const originalGet = app.get.bind(app);
        const originalPost = app.post.bind(app);
        const originalPut = app.put.bind(app);
        const originalDelete = app.delete.bind(app);
        const originalPatch = app.patch.bind(app);

        // Override methods to capture metadata
        app.get = function (path: string, ...handlers: unknown[]): typeof app {
            const metadata = extractMetadata(handlers);
            if (metadata) {
                registerRoute("get", path, metadata);
            }
            // Call original with first handler only (simplified)
            const firstHandler = handlers.find((h) => typeof h === "function") as Handler | undefined;
            if (firstHandler) {
                originalGet(path, firstHandler);
            }
            return app;
        };

        app.post = function (path: string, ...handlers: unknown[]): typeof app {
            const metadata = extractMetadata(handlers);
            if (metadata) {
                registerRoute("post", path, metadata);
            }
            const firstHandler = handlers.find((h) => typeof h === "function") as Handler | undefined;
            if (firstHandler) {
                originalPost(path, firstHandler);
            }
            return app;
        };

        app.put = function (path: string, ...handlers: unknown[]): typeof app {
            const metadata = extractMetadata(handlers);
            if (metadata) {
                registerRoute("put", path, metadata);
            }
            const firstHandler = handlers.find((h) => typeof h === "function") as Handler | undefined;
            if (firstHandler) {
                originalPut(path, firstHandler);
            }
            return app;
        };

        app.delete = function (path: string, ...handlers: unknown[]): typeof app {
            const metadata = extractMetadata(handlers);
            if (metadata) {
                registerRoute("delete", path, metadata);
            }
            const firstHandler = handlers.find((h) => typeof h === "function") as Handler | undefined;
            if (firstHandler) {
                originalDelete(path, firstHandler);
            }
            return app;
        };

        app.patch = function (path: string, ...handlers: unknown[]): typeof app {
            const metadata = extractMetadata(handlers);
            if (metadata) {
                registerRoute("patch", path, metadata);
            }
            const firstHandler = handlers.find((h) => typeof h === "function") as Handler | undefined;
            if (firstHandler) {
                originalPatch(path, firstHandler);
            }
            return app;
        };
    }

    /**
     * Extract metadata from handlers array
     */
    function extractMetadata(handlers: unknown[]): RouteMetadata | null {
        for (const handler of handlers) {
            if (handler && typeof handler === "object" && "_openapiMetadata" in handler) {
                return (handler as { _openapiMetadata: RouteMetadata })._openapiMetadata;
            }
        }
        return null;
    }

    return {
        generate,
        serve,
        attach,
    };
}

/**
 * Define route metadata decorator
 *
 * Usage:
 *   app.get('/users', defineRoute({ summary: 'List users' }), handler)
 */
export function defineRoute(metadata: RouteMetadata): { _openapiMetadata: RouteMetadata } {
    return { _openapiMetadata: metadata };
}

/**
 * Get Swagger UI HTML
 */
function getSwaggerUI(specUrl: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API Documentation</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
    <script>
        SwaggerUIBundle({
            url: '${specUrl}',
            dom_id: '#swagger-ui',
            presets: [
                SwaggerUIBundle.presets.apis,
                SwaggerUIBundle.presets.standalone
            ],
            layout: 'BaseLayout'
        });
    </script>
</body>
</html>`;
}

export type { Handler, Middleware };
