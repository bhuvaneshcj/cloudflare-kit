/**
 * WebSocket Module
 *
 * Provides WebSocket handlers for Cloudflare Workers with support for
 * regular WebSocket upgrades and Durable Object hibernation.
 */

/**
 * WebSocket context passed to handlers
 */
export interface WebSocketContext {
    /** Environment bindings */
    env: Record<string, unknown>;
    /** Original HTTP request */
    request: Request;
    /** Request URL */
    url: URL;
    /** Custom state for sharing data between handlers */
    state: Record<string, unknown>;
}

/**
 * WebSocket event handlers
 */
export interface WebSocketHandlerOptions {
    /** Called when WebSocket connection opens */
    onOpen?: (ws: WebSocket, ctx: WebSocketContext) => void | Promise<void>;
    /** Called when a message is received */
    onMessage?: (ws: WebSocket, message: string | ArrayBuffer, ctx: WebSocketContext) => void | Promise<void>;
    /** Called when WebSocket connection closes */
    onClose?: (ws: WebSocket, code: number, reason: string, ctx: WebSocketContext) => void | Promise<void>;
    /** Called when an error occurs */
    onError?: (ws: WebSocket, error: Error, ctx: WebSocketContext) => void | Promise<void>;
    /** Maximum number of concurrent connections (default: 100) */
    maxConnections?: number;
}

/**
 * Durable Object WebSocket context with hibernation support
 */
export interface DurableWebSocketContext extends WebSocketContext {
    /** Durable Object state for hibernation */
    durableState: DurableObjectState;
    /** Durable Object storage */
    storage: DurableObjectStorage;
}

/**
 * Durable Object WebSocket event handlers
 */
export interface DurableWebSocketHandlerOptions {
    onOpen?: (ws: WebSocket, ctx: DurableWebSocketContext) => void | Promise<void>;
    onMessage?: (ws: WebSocket, message: string | ArrayBuffer, ctx: DurableWebSocketContext) => void | Promise<void>;
    onClose?: (ws: WebSocket, code: number, reason: string, ctx: DurableWebSocketContext) => void | Promise<void>;
    onError?: (ws: WebSocket, error: Error, ctx: DurableWebSocketContext) => void | Promise<void>;
}

/** Official Durable Object hibernation / storage types (workers-types v5+) */
export type { DurableObjectState, DurableObjectStorage } from "@cloudflare/workers-types";

import type { DurableObjectState, DurableObjectStorage } from "@cloudflare/workers-types";

/**
 * WebSocket message event
 */
interface WebSocketMessageEvent {
    data: string | ArrayBuffer;
}

/**
 * WebSocket close event
 */
interface WebSocketCloseEvent {
    code: number;
    reason: string;
}

/**
 * WebSocket error event
 */
interface WebSocketErrorEvent {
    error?: Error;
    message?: string;
}

/**
 * Create a WebSocket handler for Cloudflare Workers
 *
 * Handles the HTTP upgrade process automatically and manages WebSocket events.
 *
 * @example
 * ```typescript
 * // Basic WebSocket echo server
 * const wsHandler = createWebSocketHandler({
 *   onOpen(ws, ctx) {
 *     console.log('Client connected');
 *     ws.send(JSON.stringify({ type: 'connected', id: crypto.randomUUID() }));
 *   },
 *   onMessage(ws, message, ctx) {
 *     console.log('Received:', message);
 *     ws.send(JSON.stringify({ type: 'echo', data: message }));
 *   },
 *   onClose(ws, code, reason, ctx) {
 *     console.log('Client disconnected:', code, reason);
 *   },
 *   onError(ws, error, ctx) {
 *     console.error('WebSocket error:', error);
 *   }
 * });
 *
 * // Use in your app
 * app.get('/ws', wsHandler);
 *
 * // Or as a standalone handler
 * export default {
 *   async fetch(request, env, ctx) {
 *     const url = new URL(request.url);
 *     if (url.pathname === '/ws') {
 *       return wsHandler.fetch(request, env, ctx);
 *     }
 *     return new Response('Not Found', { status: 404 });
 *   }
 * };
 * ```
 */
// Connection tracking for rate limiting
const activeConnections = new Map<string, Set<WebSocket>>();

/**
 * Adapt a WebSocket handler for use directly in a createApp route.
 */
export function asHandler(wsHandler: {
    fetch(request: Request, env: Record<string, unknown>, executionContext: ExecutionContext): Promise<Response>;
}): import("../core/types").Handler {
    return (context) => wsHandler.fetch(context.request, context.env, context.executionContext);
}

export function createWebSocketHandler(options: WebSocketHandlerOptions) {
    const maxConnections = options.maxConnections ?? 100;
    const handlerId = crypto.randomUUID();

    // Initialize connection set for this handler
    if (!activeConnections.has(handlerId)) {
        activeConnections.set(handlerId, new Set());
    }
    const connections = activeConnections.get(handlerId)!;

    return {
        async fetch(request: Request, env: Record<string, unknown>, _executionContext: ExecutionContext): Promise<Response> {
            // Check for WebSocket upgrade header
            const upgradeHeader = request.headers.get("Upgrade");
            if (upgradeHeader !== "websocket") {
                return new Response(JSON.stringify({ error: "Expected Upgrade: websocket header" }), {
                    status: 426,
                    headers: { "Content-Type": "application/json" },
                });
            }

            // Check connection limit
            if (connections.size >= maxConnections) {
                return new Response(JSON.stringify({ error: "Connection limit exceeded. Try again later." }), {
                    status: 503,
                    headers: { "Content-Type": "application/json" },
                });
            }

            try {
                // Create WebSocket pair using Cloudflare Workers API
                const webSocketPair = new WebSocketPair();
                const [client, server] = Object.values(webSocketPair);

                // Accept the WebSocket
                server.accept();

                // Track connection
                connections.add(server);

                // Create context
                const url = new URL(request.url);
                const context: WebSocketContext = {
                    env,
                    request,
                    url,
                    state: {},
                };

                // Set up event handlers
                if (options.onMessage) {
                    server.addEventListener("message", async (event: WebSocketMessageEvent) => {
                        try {
                            await options.onMessage!(server, event.data, context);
                        } catch (error) {
                            console.error("WebSocket message handler error:", error);
                            if (options.onError) {
                                await options.onError(server, error as Error, context);
                            }
                        }
                    });
                }

                // Always track connection cleanup
                server.addEventListener("close", async (event: WebSocketCloseEvent) => {
                    connections.delete(server);
                    if (options.onClose) {
                        try {
                            await options.onClose!(server, event.code, event.reason, context);
                        } catch (error) {
                            console.error("WebSocket close handler error:", error);
                        }
                    }
                });

                if (options.onError) {
                    server.addEventListener("error", async (event: WebSocketErrorEvent) => {
                        connections.delete(server);
                        try {
                            const error = event.error || new Error("WebSocket error");
                            await options.onError!(server, error, context);
                        } catch (err) {
                            console.error("WebSocket error handler error:", err);
                        }
                    });
                }

                // Call onOpen handler
                if (options.onOpen) {
                    try {
                        await options.onOpen(server, context);
                    } catch (error) {
                        console.error("WebSocket open handler error:", error);
                        server.close(1011, "Internal server error");
                        return new Response(JSON.stringify({ error: "WebSocket setup failed" }), {
                            status: 500,
                            headers: { "Content-Type": "application/json" },
                        });
                    }
                }

                // Return the client WebSocket as the response
                return new Response(null, {
                    status: 101,
                    webSocket: client,
                });
            } catch (error) {
                console.error("WebSocket upgrade error:", error);
                return new Response(JSON.stringify({ error: "WebSocket upgrade failed" }), {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                });
            }
        },
    };
}

/**
 * Create a Durable Object WebSocket handler with hibernation support.
 *
 * IMPORTANT: `addEventListener` on the WebSocket does NOT survive DO hibernation.
 * Your Durable Object class must forward hibernation callbacks to the helpers
 * returned here (`webSocketMessage`, `webSocketClose`, `webSocketError`).
 *
 * @example
 * ```typescript
 * export class ChatRoom {
 *   private ws;
 *   constructor(state, env) {
 *     this.ws = createDurableWebSocket({
 *       onMessage(ws, message, ctx) { console.log(message); },
 *     });
 *     this.state = state;
 *     this.env = env;
 *   }
 *   async fetch(request) {
 *     return this.ws.fetch(request, this.env, this.state);
 *   }
 *   async webSocketMessage(ws, message) {
 *     return this.ws.webSocketMessage(ws, message, this.env, this.state);
 *   }
 *   async webSocketClose(ws, code, reason) {
 *     return this.ws.webSocketClose(ws, code, reason, this.env, this.state);
 *   }
 * }
 * ```
 */
export function createDurableWebSocket(options: DurableWebSocketHandlerOptions) {
    function buildContext(
        request: Request | undefined,
        env: Record<string, unknown>,
        durableState: DurableObjectState,
        storage?: DurableObjectStorage,
    ): DurableWebSocketContext {
        const url = request ? new URL(request.url) : new URL("https://localhost/");
        return {
            env,
            request: request ?? new Request(url),
            url,
            state: {},
            durableState,
            storage: storage ?? durableState.storage,
        };
    }

    return {
        /**
         * Accept a WebSocket upgrade. Does not attach addEventListener handlers
         * (those would be lost on hibernation). Wire DO hibernation methods instead.
         */
        async fetch(request: Request, env: Record<string, unknown>, durableState: DurableObjectState, storage?: DurableObjectStorage): Promise<Response> {
            const upgradeHeader = request.headers.get("Upgrade");
            if (upgradeHeader !== "websocket") {
                return new Response(JSON.stringify({ error: "Expected Upgrade: websocket header" }), {
                    status: 426,
                    headers: { "Content-Type": "application/json" },
                });
            }

            const webSocketPair = new WebSocketPair();
            const [client, server] = Object.values(webSocketPair);
            const context = buildContext(request, env, durableState, storage);

            durableState.acceptWebSocket(server);

            if (options.onOpen) {
                try {
                    await options.onOpen(server, context);
                } catch (error) {
                    console.error("WebSocket open handler error:", error);
                    server.close(1011, "Internal server error");
                    return new Response(JSON.stringify({ error: "WebSocket setup failed" }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            }

            return new Response(null, {
                status: 101,
                webSocket: client,
            });
        },

        async webSocketMessage(
            ws: WebSocket,
            message: string | ArrayBuffer,
            env: Record<string, unknown>,
            durableState: DurableObjectState,
            storage?: DurableObjectStorage,
        ): Promise<void> {
            if (!options.onMessage) return;
            const context = buildContext(undefined, env, durableState, storage);
            try {
                await options.onMessage(ws, message, context);
            } catch (error) {
                console.error("WebSocket message handler error:", error);
                if (options.onError) {
                    await options.onError(ws, error as Error, context);
                }
            }
        },

        async webSocketClose(
            ws: WebSocket,
            code: number,
            reason: string,
            env: Record<string, unknown>,
            durableState: DurableObjectState,
            storage?: DurableObjectStorage,
        ): Promise<void> {
            if (!options.onClose) return;
            const context = buildContext(undefined, env, durableState, storage);
            try {
                await options.onClose(ws, code, reason, context);
            } catch (error) {
                console.error("WebSocket close handler error:", error);
            }
        },

        async webSocketError(
            ws: WebSocket,
            error: unknown,
            env: Record<string, unknown>,
            durableState: DurableObjectState,
            storage?: DurableObjectStorage,
        ): Promise<void> {
            if (!options.onError) return;
            const context = buildContext(undefined, env, durableState, storage);
            await options.onError(ws, error instanceof Error ? error : new Error(String(error)), context);
        },
    };
}

/**
 * WebSocketPair type declaration for Cloudflare Workers
 */
declare class WebSocketPair {
    0: WebSocket; // Client
    1: WebSocket; // Server
}
