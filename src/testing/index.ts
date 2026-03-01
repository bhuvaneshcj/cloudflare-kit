/**
 * Testing utilities for cloudflare-kit
 *
 * Provides mock implementations and test helpers for unit testing
 * Cloudflare Workers applications without needing the actual runtime.
 *
 * @example
 * ```typescript
 * import { createApp } from 'cloudflare-kit';
 * import { createTestApp, mockEnv, mockRequest } from 'cloudflare-kit/testing';
 *
 * const app = createApp();
 * app.get('/hello', (ctx) => ({ message: 'Hello!' }));
 *
 * const testApp = createTestApp(app);
 * const response = await testApp.request('GET', '/hello');
 *
 * expect(response.status).toBe(200);
 * expect(await response.json()).toEqual({ message: 'Hello!' });
 * ```
 */

import type { App } from "../core/app";

// ============================================================================
// Mock Request Utilities
// ============================================================================

export interface MockRequestOptions {
    /** Request headers */
    headers?: Record<string, string>;
    /** Request body (string or object) */
    body?: string | object;
    /** Automatically set Content-Type: application/json when body is object */
    json?: unknown;
    /** Query parameters to append to URL */
    params?: Record<string, string>;
}

/**
 * Create a mock Request object for testing
 *
 * @param method - HTTP method
 * @param url - Request URL
 * @param options - Optional request configuration
 * @returns A Request object suitable for app.fetch()
 *
 * @example
 * ```typescript
 * const request = mockRequest('POST', '/api/users', {
 *   json: { name: 'John', email: 'john@example.com' },
 *   headers: { 'X-Custom-Header': 'value' }
 * });
 * ```
 */
export function mockRequest(method: string, url: string, options: MockRequestOptions = {}): Request {
    let body: BodyInit | null = null;
    const headers = new Headers(options.headers);

    // Handle JSON body
    if (options.json !== undefined) {
        body = JSON.stringify(options.json);
        if (!headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
        }
    } else if (options.body !== undefined) {
        if (typeof options.body === "object") {
            body = JSON.stringify(options.body);
            if (!headers.has("Content-Type")) {
                headers.set("Content-Type", "application/json");
            }
        } else {
            body = options.body;
        }
    }

    // Add query parameters
    let finalUrl = url;
    if (options.params && Object.keys(options.params).length > 0) {
        const urlObj = new URL(url, "http://localhost");
        for (const [key, value] of Object.entries(options.params)) {
            urlObj.searchParams.append(key, value);
        }
        finalUrl = urlObj.pathname + urlObj.search;
    }

    return new Request(finalUrl, {
        method,
        headers,
        body,
    });
}

// ============================================================================
// Test App Wrapper
// ============================================================================

export interface TestResponse {
    /** HTTP status code */
    status: number;
    /** Response headers */
    headers: Headers;
    /** Raw response body */
    body: string;
    /** Parse response as JSON */
    json<T = unknown>(): Promise<T>;
    /** Parse response as text */
    text(): Promise<string>;
}

export interface TestApp {
    /**
     * Make a request to the app
     *
     * @param method - HTTP method
     * @param path - Request path
     * @param options - Request options
     * @returns TestResponse with parsed data
     */
    request(method: string, path: string, options?: MockRequestOptions): Promise<TestResponse>;

    /**
     * Make a GET request
     */
    get(path: string, options?: MockRequestOptions): Promise<TestResponse>;

    /**
     * Make a POST request
     */
    post(path: string, options?: MockRequestOptions): Promise<TestResponse>;

    /**
     * Make a PUT request
     */
    put(path: string, options?: MockRequestOptions): Promise<TestResponse>;

    /**
     * Make a PATCH request
     */
    patch(path: string, options?: MockRequestOptions): Promise<TestResponse>;

    /**
     * Make a DELETE request
     */
    delete(path: string, options?: MockRequestOptions): Promise<TestResponse>;
}

/**
 * Create a test wrapper for an app
 *
 * @param app - The app to test
 * @returns TestApp with convenience methods
 *
 * @example
 * ```typescript
 * const app = createApp();
 * app.get('/users/:id', (ctx) => ({ id: ctx.params.id }));
 *
 * const testApp = createTestApp(app);
 * const response = await testApp.get('/users/123');
 *
 * expect(response.status).toBe(200);
 * expect(await response.json()).toEqual({ id: '123' });
 * ```
 */
export function createTestApp(app: App): TestApp {
    const env = mockEnv();
    const makeRequest = async (
        method: string,
        path: string,
        options: MockRequestOptions = {},
    ): Promise<TestResponse> => {
        const request = mockRequest(method, path, options);
        const response = await app.fetch(request, env, createMockExecutionContext());

        return {
            status: response.status,
            headers: response.headers,
            body: await response.text(),
            json: async <T>() => {
                const text = await response.clone().text();
                return JSON.parse(text) as T;
            },
            text: async () => response.clone().text(),
        };
    };

    return {
        request: makeRequest,
        get: (path, options) => makeRequest("GET", path, options),
        post: (path, options) => makeRequest("POST", path, options),
        put: (path, options) => makeRequest("PUT", path, options),
        patch: (path, options) => makeRequest("PATCH", path, options),
        delete: (path, options) => makeRequest("DELETE", path, options),
    };
}

// ============================================================================
// Mock Environment
// ============================================================================

export interface MockKVNamespace {
    get(key: string): Promise<string | null>;
    get(key: string, type: "text"): Promise<string | null>;
    get(key: string, type: "json"): Promise<unknown | null>;
    get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
    get(key: string, type: "stream"): Promise<ReadableStream | null>;
    put(key: string, value: string | ArrayBuffer | ReadableStream): Promise<void>;
    put(key: string, value: string, options: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
        keys: { name: string; expiration?: number }[];
        list_complete: boolean;
        cursor?: string;
    }>;
    /** Get all calls made to this mock for assertions */
    _calls: { method: string; args: unknown[] }[];
    /** Clear all stored data and calls */
    _clear(): void;
}

/**
 * Create an in-memory KV mock
 *
 * @returns MockKVNamespace that implements the KV interface
 *
 * @example
 * ```typescript
 * const kv = createMockKV();
 * await kv.put('key', 'value');
 * const value = await kv.get('key'); // 'value'
 * expect(kv._calls).toContainEqual({ method: 'put', args: ['key', 'value'] });
 * ```
 */
export function createMockKV(): MockKVNamespace {
    const store = new Map<string, { value: string; expiration?: number }>();
    const calls: { method: string; args: unknown[] }[] = [];

    const recordCall = (method: string, args: unknown[]) => {
        calls.push({ method, args: [...args] });
    };

    return {
        _calls: calls,
        _clear: () => {
            store.clear();
            calls.length = 0;
        },

        async get(key: string, type?: string): Promise<unknown> {
            recordCall("get", [key, type]);
            const entry = store.get(key);
            if (!entry) return null;
            if (entry.expiration && entry.expiration < Date.now()) {
                store.delete(key);
                return null;
            }

            if (type === "json") {
                return JSON.parse(entry.value);
            } else if (type === "arrayBuffer") {
                return new TextEncoder().encode(entry.value).buffer;
            } else if (type === "stream") {
                const encoder = new TextEncoder();
                return new ReadableStream({
                    start(controller) {
                        controller.enqueue(encoder.encode(entry.value));
                        controller.close();
                    },
                });
            }
            return entry.value;
        },

        async put(key: string, value: unknown, options?: { expirationTtl?: number }): Promise<void> {
            recordCall("put", [key, value, options]);
            let storeValue: string;
            if (value instanceof ArrayBuffer) {
                storeValue = new TextDecoder().decode(value);
            } else if (value instanceof ReadableStream) {
                const reader = value.getReader();
                const chunks: Uint8Array[] = [];
                while (true) {
                    const { done, value: chunk } = await reader.read();
                    if (done) break;
                    chunks.push(chunk);
                }
                // Concatenate chunks without using Node.js Buffer
                const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
                const combined = new Uint8Array(totalLength);
                let offset = 0;
                for (const chunk of chunks) {
                    combined.set(chunk, offset);
                    offset += chunk.length;
                }
                storeValue = new TextDecoder().decode(combined);
            } else {
                storeValue = String(value);
            }
            const expiration = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined;
            store.set(key, { value: storeValue, expiration });
        },

        async delete(key: string): Promise<void> {
            recordCall("delete", [key]);
            store.delete(key);
        },

        async list(options = {}) {
            recordCall("list", [options]);
            const keys = Array.from(store.entries())
                .filter(([key]) => !options.prefix || key.startsWith(options.prefix))
                .map(([name, entry]) => ({
                    name,
                    expiration: entry.expiration ? Math.floor(entry.expiration / 1000) : undefined,
                }))
                .slice(0, options.limit || Infinity);

            return {
                keys,
                list_complete: true,
            };
        },
    } as MockKVNamespace;
}

// ============================================================================
// Mock D1 Database
// ============================================================================

export interface MockD1Result<T = unknown> {
    results: T[];
    success: boolean;
    meta: {
        duration: number;
        changes?: number;
        last_row_id?: number;
        rows_read?: number;
        rows_written?: number;
    };
}

export interface MockD1Database {
    prepare(query: string): MockD1PreparedStatement;
    batch<T = unknown>(statements: MockD1PreparedStatement[]): Promise<MockD1Result<T>[]>;
    exec(query: string): Promise<{ count: number; duration: number }>;
    /** Get all calls made to this mock for assertions */
    _calls: { method: string; args: unknown[] }[];
    /** Clear all stored data and calls */
    _clear(): void;
    /** Insert mock data for testing */
    _insert(table: string, data: Record<string, unknown>): void;
}

export interface MockD1PreparedStatement {
    bind(...values: unknown[]): MockD1PreparedStatement;
    first<T = unknown>(): Promise<T | null>;
    run<T = unknown>(): Promise<MockD1Result<T>>;
    all<T = unknown>(): Promise<MockD1Result<T>>;
    raw<T = unknown>(): Promise<T[]>;
}

/**
 * Create an in-memory D1 mock
 *
 * Provides basic SQL-like operations for testing. Full SQL parsing is not
 * implemented - it uses pattern matching for common operations.
 *
 * @returns MockD1Database that implements the D1 interface
 *
 * @example
 * ```typescript
 * const db = createMockD1();
 * db._insert('users', { id: 1, name: 'John' });
 *
 * const result = await db.prepare('SELECT * FROM users WHERE id = ?').bind(1).first();
 * expect(result).toEqual({ id: 1, name: 'John' });
 * ```
 */
export function createMockD1(): MockD1Database {
    const tables = new Map<string, Map<string, Record<string, unknown>>>();
    const calls: { method: string; args: unknown[] }[] = [];
    let lastRowId = 0;

    const recordCall = (method: string, args: unknown[]) => {
        calls.push({ method, args: [...args] });
    };

    const parseQuery = (query: string) => {
        const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
        if (selectMatch) {
            return { type: "SELECT", columns: selectMatch[1].split(",").map((c) => c.trim()), table: selectMatch[2] };
        }

        const insertMatch = query.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
        if (insertMatch) {
            return {
                type: "INSERT",
                table: insertMatch[1],
                columns: insertMatch[2].split(",").map((c) => c.trim()),
            };
        }

        const updateMatch = query.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?/i);
        if (updateMatch) {
            return { type: "UPDATE", table: updateMatch[1], set: updateMatch[2], where: updateMatch[3] };
        }

        const deleteMatch = query.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
        if (deleteMatch) {
            return { type: "DELETE", table: deleteMatch[1], where: deleteMatch[2] };
        }

        return { type: "UNKNOWN", table: "" };
    };

    const createStatement = (query: string, boundValues: unknown[] = []): MockD1PreparedStatement => {
        const parsed = parseQuery(query);

        return {
            bind(...values: unknown[]) {
                return createStatement(query, [...boundValues, ...values]);
            },

            async first<T>() {
                recordCall("prepare.first", [query, boundValues]);
                const table = tables.get(parsed.table);
                if (!table) return null;
                const first = Array.from(table.values())[0];
                return first as T | null;
            },

            async run() {
                recordCall("prepare.run", [query, boundValues]);

                if (parsed.type === "INSERT") {
                    lastRowId++;
                    const table = tables.get(parsed.table);
                    if (table) {
                        const row: Record<string, unknown> = { id: lastRowId };
                        if (parsed.type === "INSERT" && "columns" in parsed) {
                            if ("columns" in parsed && parsed.columns) {
                                parsed.columns.forEach((col, i) => {
                                    row[col] = boundValues[i];
                                });
                            }
                        }
                        table.set(String(lastRowId), row);
                    }
                    return {
                        results: [],
                        success: true,
                        meta: { duration: 0, last_row_id: lastRowId },
                    };
                }

                return {
                    results: [],
                    success: true,
                    meta: { duration: 0 },
                };
            },

            async all<T>() {
                recordCall("prepare.all", [query, boundValues]);
                const table = tables.get(parsed.table);
                const results = table ? Array.from(table.values()) : [];
                return {
                    results: results as T[],
                    success: true,
                    meta: { duration: 0, rows_read: results.length },
                };
            },

            async raw<T>() {
                recordCall("prepare.raw", [query, boundValues]);
                const table = tables.get(parsed.table);
                return table ? (Array.from(table.values()) as T[]) : [];
            },
        };
    };

    return {
        _calls: calls,
        _clear: () => {
            tables.clear();
            calls.length = 0;
            lastRowId = 0;
        },
        _insert: (tableName: string, data: Record<string, unknown>) => {
            if (!tables.has(tableName)) {
                tables.set(tableName, new Map());
            }
            const table = tables.get(tableName)!;
            const id = String(data.id ?? ++lastRowId);
            table.set(id, { ...data, id });
        },

        prepare(query: string) {
            recordCall("prepare", [query]);
            return createStatement(query);
        },

        async batch<T>(statements: MockD1PreparedStatement[]) {
            recordCall("batch", [statements.length]);
            return Promise.all(statements.map((s) => s.run<T>()));
        },

        async exec(query: string) {
            recordCall("exec", [query]);
            return { count: 1, duration: 0 };
        },
    };
}

// ============================================================================
// Mock R2 Storage
// ============================================================================

export interface MockR2Object {
    key: string;
    size: number;
    etag: string;
    httpEtag: string;
    httpMetadata: Record<string, string>;
    customMetadata: Record<string, string>;
    range?: { offset: number; length: number };
    checksums: {
        md5?: string;
        sha1?: string;
        sha256?: string;
        sha384?: string;
        sha512?: string;
    };
    uploaded: Date;
    version: string;
    body?: ReadableStream;
    bodyUsed: boolean;
    arrayBuffer(): Promise<ArrayBuffer>;
    blob(): Promise<Blob>;
    bytes(): Promise<Uint8Array>;
    text(): Promise<string>;
    json<T>(): Promise<T>;
}

export interface MockR2Bucket {
    get(key: string): Promise<MockR2Object | null>;
    put(
        key: string,
        value: string | ArrayBuffer | ReadableStream,
        options?: {
            httpMetadata?: Record<string, string>;
            customMetadata?: Record<string, string>;
        },
    ): Promise<MockR2Object>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
        objects: MockR2Object[];
        truncated: boolean;
        cursor?: string;
    }>;
    /** Get all calls made to this mock for assertions */
    _calls: { method: string; args: unknown[] }[];
    /** Clear all stored data and calls */
    _clear(): void;
}

/**
 * Create an in-memory R2 mock
 *
 * @returns MockR2Bucket that implements the R2 interface
 *
 * @example
 * ```typescript
 * const bucket = createMockR2();
 * await bucket.put('file.txt', 'Hello World');
 * const obj = await bucket.get('file.txt');
 * expect(await obj?.text()).toBe('Hello World');
 * ```
 */
export function createMockR2(): MockR2Bucket {
    const objects = new Map<string, { data: Uint8Array; metadata: Record<string, unknown> }>();
    const calls: { method: string; args: unknown[] }[] = [];

    const recordCall = (method: string, args: unknown[]) => {
        calls.push({ method, args: [...args] });
    };

    const createR2Object = (key: string, data: Uint8Array, metadata: Record<string, unknown>): MockR2Object => {
        return {
            key,
            size: data.byteLength,
            etag: crypto.randomUUID(),
            httpEtag: `"${crypto.randomUUID()}"`,
            httpMetadata: (metadata.httpMetadata as Record<string, string>) || {},
            customMetadata: (metadata.customMetadata as Record<string, string>) || {},
            checksums: {},
            uploaded: new Date(),
            version: crypto.randomUUID(),
            bodyUsed: false,
            async arrayBuffer() {
                return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
            },
            async blob() {
                return new Blob([data]);
            },
            async bytes() {
                return data;
            },
            async text() {
                return new TextDecoder().decode(data);
            },
            async json<T>() {
                return JSON.parse(new TextDecoder().decode(data)) as T;
            },
        };
    };

    return {
        _calls: calls,
        _clear: () => {
            objects.clear();
            calls.length = 0;
        },

        async get(key: string) {
            recordCall("get", [key]);
            const obj = objects.get(key);
            if (!obj) return null;
            return createR2Object(key, obj.data, obj.metadata);
        },

        async put(key: string, value: unknown, options = {}) {
            recordCall("put", [key, value, options]);
            let data: Uint8Array;

            if (value instanceof ArrayBuffer) {
                data = new Uint8Array(value);
            } else if (value instanceof ReadableStream) {
                const reader = value.getReader();
                const chunks: Uint8Array[] = [];
                while (true) {
                    const { done, value: chunk } = await reader.read();
                    if (done) break;
                    chunks.push(chunk);
                }
                const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
                data = new Uint8Array(totalLength);
                let offset = 0;
                for (const chunk of chunks) {
                    data.set(chunk, offset);
                    offset += chunk.length;
                }
            } else {
                data = new TextEncoder().encode(String(value));
            }

            objects.set(key, { data, metadata: options });
            return createR2Object(key, data, options);
        },

        async delete(key: string) {
            recordCall("delete", [key]);
            objects.delete(key);
        },

        async list(options = {}) {
            recordCall("list", [options]);
            const allObjects = Array.from(objects.entries())
                .filter(([key]) => !options.prefix || key.startsWith(options.prefix))
                .slice(0, options.limit || 1000);

            return {
                objects: allObjects.map(([key, obj]) => createR2Object(key, obj.data, obj.metadata)),
                truncated: false,
            };
        },
    };
}

// ============================================================================
// Mock Environment Factory
// ============================================================================

export interface MockEnv {
    /** Mock KV namespace */
    KV: MockKVNamespace;
    /** Mock D1 database */
    DB: MockD1Database;
    /** Mock R2 bucket */
    BUCKET: MockR2Bucket;
    /** Mock queue */
    QUEUE: {
        send(message: unknown): Promise<void>;
        sendBatch(messages: unknown[]): Promise<void>;
        _calls: { method: string; args: unknown[] }[];
        _clear(): void;
    };
    /** Any additional bindings */
    [key: string]: unknown;
}

/**
 * Create a complete mock environment with all Cloudflare bindings
 *
 * @param overrides - Additional env bindings to merge
 * @returns MockEnv ready for testing
 *
 * @example
 * ```typescript
 * const env = mockEnv({
 *   JWT_SECRET: 'test-secret-32-chars-long!!!!',
 *   API_KEY: 'test-api-key'
 * });
 *
 * await env.KV.put('key', 'value');
 * expect(env.KV._calls).toHaveLength(1);
 * ```
 */
export function mockEnv(overrides: Record<string, unknown> = {}): MockEnv {
    const kv = createMockKV();
    const db = createMockD1();
    const bucket = createMockR2();
    const calls: { method: string; args: unknown[] }[] = [];

    return {
        KV: kv,
        DB: db,
        BUCKET: bucket,
        QUEUE: {
            async send(message: unknown) {
                calls.push({ method: "send", args: [message] });
            },
            async sendBatch(messages: unknown[]) {
                calls.push({ method: "sendBatch", args: messages });
            },
            _calls: calls,
            _clear: () => {
                calls.length = 0;
            },
        },
        ...overrides,
    };
}

// ============================================================================
// Mock Execution Context
// ============================================================================

/**
 * Create a mock ExecutionContext for testing
 *
 * @returns ExecutionContext-like object with waitUntil
 */
export function createMockExecutionContext(): ExecutionContext {
    const promises: Promise<unknown>[] = [];

    return {
        waitUntil(promise: Promise<unknown>) {
            promises.push(promise);
        },
        passThroughOnException() {
            // No-op in tests
        },
    } as ExecutionContext;
}

// ============================================================================
// Test Assertions Helpers
// ============================================================================

/**
 * Assert that a response is JSON and matches expected data
 *
 * @param response - TestResponse from createTestApp
 * @param expected - Expected JSON data (partial match)
 */
export async function expectJSON<T extends Record<string, unknown>>(
    response: TestResponse,
    expected: Partial<T>,
): Promise<void> {
    if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}: ${response.body}`);
    }

    const contentType = response.headers.get("Content-Type");
    if (!contentType?.includes("application/json")) {
        throw new Error(`Expected JSON response, got ${contentType}`);
    }

    const data = await response.json<T>();

    for (const [key, value] of Object.entries(expected)) {
        if ((data as Record<string, unknown>)[key] !== value) {
            throw new Error(`Expected ${key} to be ${value}, got ${(data as Record<string, unknown>)[key]}`);
        }
    }
}

/**
 * Assert that a response has a specific status code
 *
 * @param response - TestResponse
 * @param status - Expected status code
 */
export function expectStatus(response: TestResponse, status: number): void {
    if (response.status !== status) {
        throw new Error(`Expected status ${status}, got ${response.status}: ${response.body}`);
    }
}
