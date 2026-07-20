/**
 * Core Type Definitions
 */

import type { Plugin } from "../plugins/types";

export interface RequestContext<Env extends Record<string, unknown> = Record<string, unknown>> {
    request: Request;
    url: URL;
    env: Env;
    executionContext: ExecutionContext;
    state: Record<string, unknown>;
    params: Record<string, string>;
    query: Record<string, string | string[]>;
    [key: string]: unknown;
}

export type Middleware<Env extends Record<string, unknown> = Record<string, unknown>> = (
    context: RequestContext<Env>,
) => Promise<Response | void> | Response | void;

export type Handler<Env extends Record<string, unknown> = Record<string, unknown>> = (
    context: RequestContext<Env>,
) => Promise<Response> | Response;

export interface AppOptions<Env extends Record<string, unknown> = Record<string, unknown>> {
    database?: unknown;
    cache?: unknown;
    storage?: unknown;
    queue?: unknown;
    logger?: unknown;
    auth?: unknown;
    plugins?: Plugin[];
    onError?: (error: unknown, context: RequestContext<Env>) => Response | Promise<Response>;
    /** Normalize trailing slashes before matching (default: false) */
    trailingSlash?: "ignore" | "redirect" | false;
}
