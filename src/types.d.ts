/**
 * Global type declarations for Cloudflare Workers environment
 */

// Cloudflare Workers runtime types
declare interface Request extends globalThis.Request {}
declare interface Response extends globalThis.Response {}
declare interface Headers extends globalThis.Headers {}
declare interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
}

declare const crypto: Crypto;
declare const console: Console;

// Cloudflare Workers specific types
declare interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
    exec(query: string): Promise<D1Result>;
}

declare interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(): Promise<T | null>;
    run(): Promise<D1Result>;
    all<T = unknown>(): Promise<D1Result<T>>;
    raw<T = unknown>(): Promise<T[]>;
}

declare interface D1Result<T = unknown> {
    results: T[];
    success: boolean;
    error?: string;
    meta?: {
        duration: number;
        changes?: number;
        last_row_id?: number;
        rows_read?: number;
        rows_written?: number;
    };
}

declare interface KVNamespace {
    get(key: string, type: "text"): Promise<string | null>;
    get(key: string, type: "json"): Promise<unknown | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
        keys: { name: string }[];
        cursor?: string;
        list_complete: boolean;
    }>;
}

declare interface R2Bucket {
    put(
        key: string,
        value: ReadableStream | ArrayBuffer | string | Blob,
        options?: {
            httpMetadata?: { contentType?: string };
            customMetadata?: Record<string, string>;
        },
    ): Promise<R2Object>;
    get(key: string): Promise<R2Object | null>;
    head(key: string): Promise<R2Object | null>;
    delete(key: string | string[]): Promise<void>;
}

declare interface R2Object {
    key: string;
    size: number;
    etag: string;
    httpMetadata?: { contentType?: string };
    customMetadata?: Record<string, string>;
    uploaded: Date;
    body?: ReadableStream;
}

declare interface Queue<T = unknown> {
    send(body: T, options?: { delaySeconds?: number }): Promise<void>;
    sendBatch(messages: { body: T; delaySeconds?: number }[]): Promise<void>;
}

declare interface MessageBatch<T = unknown> {
    messages: Message<T>[];
    queue: string;
}

declare interface Message<T = unknown> {
    id: string;
    body: T;
    timestamp: Date;
    attempts: number;
    ack(): void;
    retry(): void;
}

// Web Crypto API
declare const TextEncoder: typeof globalThis.TextEncoder;
declare const TextDecoder: typeof globalThis.TextDecoder;

// URL type for Workers
type URL = globalThis.URL;
declare const URL: typeof globalThis.URL;
declare const URLSearchParams: typeof globalThis.URLSearchParams;

// Additional Workers-specific globals
declare function atob(data: string): string;
declare function btoa(data: string): string;
declare function fetch(request: Request | string, init?: RequestInit): Promise<Response>;
