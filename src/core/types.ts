/**
 * Core Type Definitions
 */

export interface RequestContext {
    request: Request;
    url: URL;
    env: Record<string, unknown>;
    executionContext: ExecutionContext;
    state: Record<string, unknown>;
    [key: string]: unknown;
}

export type Middleware = (context: RequestContext) => Promise<Response | void> | Response | void;
export type Handler = (context: RequestContext) => Promise<Response> | Response;

export interface AppOptions {
    database?: unknown;
    cache?: unknown;
    storage?: unknown;
    queue?: unknown;
    logger?: unknown;
    auth?: unknown;
}
