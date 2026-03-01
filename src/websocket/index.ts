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

/**
 * Durable Object state interface (subset for hibernation)
 */
export interface DurableObjectState {
    acceptWebSocket(ws: WebSocket, tags?: string[]): void;
    getWebSockets(tag?: string): WebSocket[];
    setWebSocketAutoResponse(request: Response | null): void;
}

/**
 * Durable Object storage interface
 */
export interface DurableObjectStorage {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    list<T>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>>;
}

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

export function createWebSocketHandler(options: WebSocketHandlerOptions) {
    const maxConnections = options.maxConnections ?? 100;
    const handlerId = crypto.randomUUID();

    // Initialize connection set for this handler
    if (!activeConnections.has(handlerId)) {
        activeConnections.set(handlerId, new Set());
    }
    const connections = activeConnections.get(handlerId)!;

    return {
        async fetch(
            request: Request,
            env: Record<string, unknown>,
            _executionContext: ExecutionContext,
        ): Promise<Response> {
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
 * Create a WebSocket handler for use inside Durable Objects
 *
 * Uses hibernation API for efficient resource usage when connections are idle.
 *
 * @example
 * ```typescript
 * // Durable Object class
 * export class ChatRoom implements DurableObject {
 *   private wsHandler: ReturnType<typeof createDurableWebSocket>;
 *
 *   constructor(private state: DurableObjectState, private env: Env) {
 *     this.wsHandler = createDurableWebSocket({
 *       onOpen(ws, ctx) {
 *         console.log('Client connected to chat room');
 *         // Broadcast to all connected clients
 *         for (const client of ctx.durableState.getWebSockets()) {
 *           if (client !== ws) {
 *             client.send(JSON.stringify({ type: 'user_joined' }));
 *           }
 *         }
 *       },
 *       onMessage(ws, message, ctx) {
 *         // Broadcast message to all clients
 *         for (const client of ctx.durableState.getWebSockets()) {
 *           client.send(JSON.stringify({
 *             type: 'message',
 *             data: message,
 *             timestamp: Date.now()
 *           }));
 *         }
 *       },
 *       onClose(ws, code, reason, ctx) {
 *         console.log('Client left chat room');
 *       }
 *     });
 *   }
 *
 *   async fetch(request: Request) {
 *     return this.wsHandler.fetch(request, this.env, {
 *       waitUntil: () => {},
 *       passThroughOnException: () => {}
 *     });
 *   }
 * }
 *
 * // In your worker
 * app.get('/chat/:roomId', async (ctx) => {
 *   const roomId = ctx.params.roomId;
 *   const id = ctx.env.CHAT_ROOMS.idFromName(roomId);
 *   const room = ctx.env.CHAT_ROOMS.get(id);
 *   return room.fetch(ctx.request);
 * });
 * ```
 */
export function createDurableWebSocket(options: DurableWebSocketHandlerOptions) {
    return {
        async fetch(
            request: Request,
            env: Record<string, unknown>,
            _executionContext: ExecutionContext,
            durableState?: DurableObjectState,
            storage?: DurableObjectStorage,
        ): Promise<Response> {
            if (!durableState) {
                return new Response(JSON.stringify({ error: "Durable Object state required" }), {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                });
            }

            // Check for WebSocket upgrade header
            const upgradeHeader = request.headers.get("Upgrade");
            if (upgradeHeader !== "websocket") {
                return new Response(JSON.stringify({ error: "Expected Upgrade: websocket header" }), {
                    status: 426,
                    headers: { "Content-Type": "application/json" },
                });
            }

            try {
                // Create WebSocket pair
                const webSocketPair = new WebSocketPair();
                const [client, server] = Object.values(webSocketPair);

                // Create Durable Object context
                const url = new URL(request.url);
                const context: DurableWebSocketContext = {
                    env,
                    request,
                    url,
                    state: {},
                    durableState,
                    storage: storage || {
                        get: async () => undefined,
                        put: async () => {},
                        delete: async () => {},
                        list: async () => new Map(),
                    },
                };

                // Set up event handlers before accepting
                // Note: In hibernation mode, these handlers should be set up to survive hibernation
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

                if (options.onClose) {
                    server.addEventListener("close", async (event: WebSocketCloseEvent) => {
                        try {
                            await options.onClose!(server, event.code, event.reason, context);
                        } catch (error) {
                            console.error("WebSocket close handler error:", error);
                        }
                    });
                }

                if (options.onError) {
                    server.addEventListener("error", async (event: WebSocketErrorEvent) => {
                        try {
                            const error = event.error || new Error("WebSocket error");
                            await options.onError!(server, error, context);
                        } catch (err) {
                            console.error("WebSocket error handler error:", err);
                        }
                    });
                }

                // Accept the WebSocket with hibernation support
                // This allows the Durable Object to hibernate when idle
                durableState.acceptWebSocket(server);

                // Call onOpen handler after accepting
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
            } catch (error) {
                console.error("Durable WebSocket upgrade error:", error);
                return new Response(JSON.stringify({ error: "WebSocket upgrade failed" }), {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                });
            }
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
