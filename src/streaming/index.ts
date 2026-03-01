/**
 * Streaming Module
 *
 * Provides Server-Sent Events (SSE) and streaming response helpers.
 */

/**
 * SSE event structure
 */
export interface SSEEvent {
    /** Event data (will be serialized to JSON if object) */
    data: unknown;
    /** Event name */
    event?: string;
    /** Event ID */
    id?: string;
    /** Retry interval in milliseconds */
    retry?: number;
}

/**
 * SSE helper interface
 */
export interface SSEHelper {
    /** Send an SSE event */
    send(event: SSEEvent): void;
    /** Close the SSE connection */
    close(): void;
    /** Get the Response object */
    response: Response;
}

/**
 * Stream writer interface
 */
export interface StreamWriter {
    /** Write a text chunk */
    write(chunk: string): void;
    /** Write JSON data */
    writeJSON(data: unknown): void;
    /** Close the stream */
    close(): void;
    /** Write an error message */
    error(msg: string): void;
}

/**
 * SSE headers for proper streaming behavior
 */
const SSE_HEADERS: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
};

/**
 * Create an SSE (Server-Sent Events) helper
 *
 * @example
 * ```typescript
 * // Basic SSE endpoint
 * app.get('/events', (ctx) => {
 *   const sse = createSSE();
 *
 *   // Send events
 *   const interval = setInterval(() => {
 *     sse.send({
 *       event: 'ping',
 *       data: { time: Date.now() }
 *     });
 *   }, 1000);
 *
 *   // Cleanup when connection closes
 *   setTimeout(() => {
 *     clearInterval(interval);
 *     sse.close();
 *   }, 30000);
 *
 *   return sse.response;
 * });
 *
 * // Named events with IDs
 * app.get('/updates', (ctx) => {
 *   const sse = createSSE();
 *
 *   sse.send({
 *     event: 'user_joined',
 *     id: 'evt_123',
 *     data: { userId: 'u456', name: 'John' }
 *   });
 *
 *   sse.send({
 *     event: 'message',
 *     id: 'evt_124',
 *     data: { text: 'Hello!' }
 *   });
 *
 *   return sse.response;
 * });
 * ```
 */
export function createSSE(): SSEHelper {
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    let isClosed = false;

    /**
     * Send an SSE event
     */
    function send(event: SSEEvent): void {
        if (isClosed) return;

        let message = "";

        // Event name
        if (event.event) {
            message += `event: ${event.event}\n`;
        }

        // Event ID
        if (event.id) {
            message += `id: ${event.id}\n`;
        }

        // Retry interval
        if (event.retry !== undefined) {
            message += `retry: ${event.retry}\n`;
        }

        // Data (handle multi-line and JSON)
        const dataStr = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
        const lines = dataStr.split("\n");
        for (const line of lines) {
            message += `data: ${line}\n`;
        }

        // End of event
        message += "\n";

        writer.write(encoder.encode(message)).catch((err) => {
            console.error("SSE write error:", err);
        });
    }

    /**
     * Close the SSE connection
     */
    function close(): void {
        if (isClosed) return;
        isClosed = true;
        writer.close().catch((err) => {
            console.error("SSE close error:", err);
        });
    }

    // Create the response
    const response = new Response(stream.readable, {
        headers: SSE_HEADERS,
    });

    return {
        send,
        close,
        response,
    };
}

/**
 * Wrap a ReadableStream in a JSON streaming response (NDJSON)
 *
 * @example
 * ```typescript
 * app.get('/stream', async (ctx) => {
 *   const stream = new ReadableStream({
 *     start(controller) {
 *       let count = 0;
 *       const interval = setInterval(() => {
 *         controller.enqueue(JSON.stringify({ count: ++count }) + '\n');
 *         if (count >= 10) {
 *           clearInterval(interval);
 *           controller.close();
 *         }
 *       }, 100);
 *     }
 *   });
 *
 *   return streamJSON(stream);
 * });
 * ```
 */
export function streamJSON(stream: ReadableStream): Response {
    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}

/**
 * Create a streaming response with a writer function
 *
 * @example
 * ```typescript
 * app.get('/stream-data', async (ctx) => {
 *   return createStreamResponse(async (writer) => {
 *     // Send text
 *     writer.write('Starting process...\n');
 *
 *     // Process items
 *     const items = await fetchItems();
 *     for (const item of items) {
 *       writer.writeJSON({ status: 'processing', item: item.id });
 *       await processItem(item);
 *     }
 *
 *     writer.writeJSON({ status: 'complete', count: items.length });
 *     writer.close();
 *   });
 * });
 *
 * // Error handling
 * app.get('/risky-stream', async (ctx) => {
 *   return createStreamResponse(async (writer) => {
 *     try {
 *       const data = await riskyOperation();
 *       writer.writeJSON({ success: true, data });
 *     } catch (error) {
 *       writer.error(error.message);
 *     } finally {
 *       writer.close();
 *     }
 *   });
 * });
 * ```
 */
export function createStreamResponse(
    fn: (writer: StreamWriter) => Promise<void>,
    contentType = "text/plain",
): Response {
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    let isClosed = false;

    const streamWriter: StreamWriter = {
        write(chunk: string): void {
            if (isClosed) return;
            writer.write(encoder.encode(chunk)).catch((err) => {
                console.error("Stream write error:", err);
            });
        },

        writeJSON(data: unknown): void {
            if (isClosed) return;
            const json = JSON.stringify(data) + "\n";
            writer.write(encoder.encode(json)).catch((err) => {
                console.error("Stream write error:", err);
            });
        },

        close(): void {
            if (isClosed) return;
            isClosed = true;
            writer.close().catch((err) => {
                console.error("Stream close error:", err);
            });
        },

        error(msg: string): void {
            if (isClosed) return;
            const errorObj = { error: msg, timestamp: new Date().toISOString() };
            writer.write(encoder.encode(JSON.stringify(errorObj) + "\n")).catch((err) => {
                console.error("Stream error write:", err);
            });
        },
    };

    // Execute the handler
    fn(streamWriter).catch((error) => {
        console.error("Stream handler error:", error);
        streamWriter.error(error instanceof Error ? error.message : "Unknown error");
        streamWriter.close();
    });

    return new Response(stream.readable, {
        headers: {
            "Content-Type": contentType,
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}

/**
 * Create a text streaming response (for AI/completion streaming)
 *
 * @example
 * ```typescript
 * app.get('/ai-complete', async (ctx) => {
 *   const ai = createAI({ binding: env.AI });
 *   const stream = await ai.stream(ctx.query.prompt);
 *
 *   return createTextStream(async (writer) => {
 *     const reader = stream.getReader();
 *     while (true) {
 *       const { done, value } = await reader.read();
 *       if (done) break;
 *       writer.write(new TextDecoder().decode(value));
 *     }
 *     writer.close();
 *   });
 * });
 * ```
 */
export function createTextStream(fn: (writer: StreamWriter) => Promise<void>): Response {
    return createStreamResponse(fn, "text/plain");
}

/**
 * Create an NDJSON (Newline Delimited JSON) streaming response
 *
 * @example
 * ```typescript
 * app.get('/logs', async (ctx) => {
 *   return createNDJSONStream(async (writer) => {
 *     const logs = await fetchLogs();
 *     for (const log of logs) {
 *       writer.writeJSON(log);
 *     }
 *     writer.close();
 *   });
 * });
 * ```
 */
export function createNDJSONStream(fn: (writer: StreamWriter) => Promise<void>): Response {
    return createStreamResponse(fn, "application/x-ndjson");
}

/**
 * Pipe a WebStream to a Response with proper headers
 *
 * @example
 * ```typescript
 * app.get('/download', async (ctx) => {
 *   const stream = await env.STORAGE.get('file.txt');
 *   return pipeStream(stream.body, 'text/plain', {
 *     'Content-Disposition': 'attachment; filename="file.txt"'
 *   });
 * });
 * ```
 */
export function pipeStream(
    stream: ReadableStream | null,
    contentType: string,
    headers?: Record<string, string>,
): Response {
    if (!stream) {
        return new Response("Stream not found", { status: 404 });
    }

    return new Response(stream, {
        headers: {
            "Content-Type": contentType,
            ...headers,
        },
    });
}
