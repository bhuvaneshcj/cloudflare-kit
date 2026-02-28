import { KVNamespace as KVNamespace$1, R2Bucket, Queue } from "@cloudflare/workers-types";

/**
 * Core Type Definitions
 */
interface RequestContext$1 {
    request: Request;
    url: URL;
    env: Record<string, unknown>;
    executionContext: ExecutionContext;
    state: Record<string, unknown>;
    [key: string]: unknown;
}
type Middleware = (context: RequestContext$1) => Promise<Response | void> | Response | void;
type Handler = (context: RequestContext$1) => Promise<Response> | Response;
interface AppOptions {
    database?: unknown;
    cache?: unknown;
    storage?: unknown;
    queue?: unknown;
    logger?: unknown;
    auth?: unknown;
}

/**
 * Core Application Module
 *
 * Provides createApp() - the main entry point for building
 * Cloudflare Worker applications with middleware support.
 */

/**
 * Create a new Cloudflare Worker application
 *
 * @example
 * ```typescript
 * const app = createApp({
 *   database: createDatabase({ binding: env.DB }),
 *   cache: createCache({ binding: env.CACHE })
 * });
 *
 * app.use(loggingMiddleware);
 * app.get('/users', getUsersHandler);
 *
 * export default app;
 * ```
 */
declare function createApp(options?: AppOptions): {
    /**
     * Add middleware to the application
     */
    use(middleware: Middleware): /*elided*/ any;
    /**
     * Register a GET route
     */
    get(path: string, handler: Handler): /*elided*/ any;
    /**
     * Register a POST route
     */
    post(path: string, handler: Handler): /*elided*/ any;
    /**
     * Register a PUT route
     */
    put(path: string, handler: Handler): /*elided*/ any;
    /**
     * Register a DELETE route
     */
    delete(path: string, handler: Handler): /*elided*/ any;
    /**
     * Register a PATCH route
     */
    patch(path: string, handler: Handler): /*elided*/ any;
    /**
     * Handle incoming requests (called by Cloudflare Workers)
     */
    fetch(request: Request, env: Record<string, unknown>, executionContext: ExecutionContext): Promise<Response>;
};

/**
 * Response Helpers
 *
 * Simple utilities for creating common HTTP responses.
 */
/**
 * Create a JSON response
 *
 * @example
 * ```typescript
 * return jsonResponse({ users: [] });
 * return jsonResponse({ user }, 201);
 * ```
 */
declare function jsonResponse(data: unknown, status?: number): Response;
/**
 * Create an error response
 *
 * @example
 * ```typescript
 * return errorResponse('User not found', 404);
 * return errorResponse('Invalid input', 400);
 * ```
 */
declare function errorResponse(message: string, status?: number): Response;
/**
 * Create a success response
 *
 * @example
 * ```typescript
 * return successResponse('User created');
 * ```
 */
declare function successResponse(message: string, status?: number): Response;
/**
 * Create a redirect response
 *
 * @example
 * ```typescript
 * return redirectResponse('/login');
 * return redirectResponse('/dashboard', 301);
 * ```
 */
declare function redirectResponse(location: string, status?: number): Response;

/**
 * Middleware System
 *
 * Pre-built middleware for common tasks.
 */

/**
 * Add CORS headers to responses
 *
 * @example
 * ```typescript
 * app.use(corsMiddleware());
 * app.use(corsMiddleware({ origin: 'https://example.com' }));
 * ```
 */
declare function corsMiddleware(options?: {
    origin?: string;
    methods?: string;
    allowHeaders?: string;
    credentials?: boolean;
}): Middleware;
/**
 * Parse JSON request body
 *
 * @example
 * ```typescript
 * app.use(jsonMiddleware());
 * // Now context.state.body contains parsed JSON
 * ```
 */
declare function jsonMiddleware(): Middleware;
/**
 * Add security headers to all responses
 *
 * @example
 * ```typescript
 * app.use(securityHeadersMiddleware());
 * ```
 */
declare function securityHeadersMiddleware(): Middleware;

/**
 * Database Type Definitions
 */
interface D1Result<T = unknown> {
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
interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
    exec(query: string): Promise<D1Result>;
    query<T = unknown>(query: string, params?: unknown[]): Promise<D1Result<T>>;
    execute(query: string, params?: unknown[]): Promise<D1Result>;
}
interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(): Promise<T | null>;
    run(): Promise<D1Result>;
    all<T = unknown>(): Promise<D1Result<T>>;
    raw<T = unknown>(): Promise<T[]>;
}
interface DatabaseOptions {
    binding: D1Database;
    migrationsPath?: string;
}

/**
 * Authentication Module
 *
 * Provides createAuth() for JWT and session-based authentication.
 */

interface AuthOptions {
    jwtSecret: string;
    sessionDuration?: number;
    database?: D1Database;
}
interface User {
    id: string;
    email: string;
    [key: string]: unknown;
}
interface Session {
    id: string;
    userId: string;
    expiresAt: Date;
}
interface AuthResult {
    success: boolean;
    user?: User;
    token?: string;
    error?: string;
}
/**
 * Create an authentication service
 *
 * @example
 * ```typescript
 * const auth = createAuth({
 *   jwtSecret: env.JWT_SECRET,
 *   sessionDuration: 60 * 60 * 24 * 7, // 7 days
 *   database: database
 * });
 *
 * // Create a token for a user
 * const result = await auth.createToken({ id: '123', email: 'user@example.com' });
 *
 * // Verify a token
 * const user = await auth.verifyToken(request.headers.get('Authorization'));
 * ```
 */
declare function createAuth(options: AuthOptions): {
    /**
     * Create a JWT token for a user
     */
    createToken(user: User): Promise<AuthResult>;
    /**
     * Verify a JWT token
     */
    verifyToken(authHeader: string | null): Promise<AuthResult>;
    /**
     * Create a session (for cookie-based auth)
     */
    createSession(user: User): Promise<AuthResult>;
    /**
     * Verify a session
     */
    verifySession(sessionId: string): Promise<AuthResult>;
};

/**
 * Database Module
 *
 * Provides createDatabase() for D1 database operations.
 */

/**
 * Create a database service
 *
 * @example
 * ```typescript
 * const database = createDatabase({
 *   binding: env.DB
 * });
 *
 * // Query users
 * const users = await database.query('SELECT * FROM users WHERE active = ?', [true]);
 *
 * // Get single user
 * const user = await database.get('SELECT * FROM users WHERE id = ?', ['123']);
 *
 * // Insert user
 * await database.execute('INSERT INTO users (id, email) VALUES (?, ?)', ['123', 'user@example.com']);
 *
 * // Update user
 * await database.execute('UPDATE users SET email = ? WHERE id = ?', ['new@example.com', '123']);
 *
 * // Delete user
 * await database.execute('DELETE FROM users WHERE id = ?', ['123']);
 * ```
 */
declare function createDatabase(options: DatabaseOptions): {
    /**
     * Execute a query and return all results
     */
    query<T = unknown>(sql: string, params?: unknown[]): Promise<D1Result<T>>;
    /**
     * Execute a query and return first result only
     */
    get<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>;
    /**
     * Execute a write query (INSERT, UPDATE, DELETE)
     */
    execute(sql: string, params?: unknown[]): Promise<D1Result>;
    /**
     * Insert a record and return the ID
     */
    insert(table: string, data: Record<string, unknown>): Promise<string | number | null>;
    /**
     * Update records
     */
    update(table: string, data: Record<string, unknown>, whereClause: string, whereParams: unknown[]): Promise<number>;
    /**
     * Delete records
     */
    delete(table: string, whereClause: string, whereParams: unknown[]): Promise<number>;
    /**
     * Run multiple queries in a batch
     */
    batch<T = unknown>(
        queries: {
            sql: string;
            params: unknown[];
        }[],
    ): Promise<D1Result<T>[]>;
    /**
     * Get the raw D1 binding for advanced usage
     */
    getBinding(): D1Database;
};
type DatabaseService = ReturnType<typeof createDatabase>;

/**
 * Cache Module
 *
 * Provides createCache() for KV caching operations.
 */

interface CacheOptions {
    binding: KVNamespace$1;
    defaultTTL?: number;
}
interface CacheEntry<T> {
    value: T;
    expiresAt?: number;
}
/**
 * Create a cache service
 *
 * @example
 * ```typescript
 * const cache = createCache({
 *   binding: env.CACHE,
 *   defaultTTL: 60 * 5 // 5 minutes default
 * });
 *
 * // Save to cache
 * await cache.set('user:123', user, 60 * 10); // 10 minutes
 *
 * // Get from cache
 * const user = await cache.get('user:123');
 * if (user) {
 *   return jsonResponse(user);
 * }
 *
 * // Delete from cache
 * await cache.delete('user:123');
 *
 * // Check if exists
 * const exists = await cache.has('user:123');
 * ```
 */
declare function createCache(options: CacheOptions): {
    /**
     * Get a value from cache
     */
    get<T = unknown>(key: string): Promise<T | null>;
    /**
     * Get a string value from cache
     */
    getString(key: string): Promise<string | null>;
    /**
     * Save a value to cache
     */
    set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void>;
    /**
     * Save a string to cache
     */
    setString(key: string, value: string, ttlSeconds?: number): Promise<void>;
    /**
     * Delete a value from cache
     */
    delete(key: string): Promise<void>;
    /**
     * Check if a key exists in cache
     */
    has(key: string): Promise<boolean>;
    /**
     * Get multiple values from cache
     */
    getMultiple<T = unknown>(keys: string[]): Promise<Record<string, T | null>>;
    /**
     * Get value or compute and cache it
     */
    getOrSet<T = unknown>(key: string, compute: () => Promise<T>, ttlSeconds?: number): Promise<T>;
    /**
     * List keys with optional prefix
     */
    listKeys(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
        keys: string[];
        cursor?: string;
    }>;
    /**
     * Get the raw KV binding for advanced usage
     */
    getBinding(): KVNamespace$1;
};
type CacheService = ReturnType<typeof createCache>;

/**
 * Storage Module
 *
 * Provides createStorage() for R2 object storage operations.
 */

interface StorageOptions {
    binding: R2Bucket;
}
interface UploadResult {
    success: boolean;
    key?: string;
    size?: number;
    etag?: string;
    url?: string;
    error?: string;
}
interface DownloadResult {
    success: boolean;
    data?: ReadableStream;
    contentType?: string;
    size?: number;
    error?: string;
}
/**
 * Create a storage service for R2
 *
 * @example
 * ```typescript
 * const storage = createStorage({
 *   binding: env.STORAGE
 * });
 *
 * // Upload a file
 * const result = await storage.upload('documents/report.pdf', fileStream, {
 *   contentType: 'application/pdf'
 * });
 *
 * // Download a file
 * const file = await storage.download('documents/report.pdf');
 * if (file.success) {
 *   return new Response(file.data);
 * }
 *
 * // Delete a file
 * await storage.delete('documents/report.pdf');
 *
 * // Check if file exists
 * const exists = await storage.exists('documents/report.pdf');
 *
 * // List files
 * const files = await storage.list('documents/');
 * ```
 */
declare function createStorage(options: StorageOptions): {
    /**
     * Upload a file to storage
     */
    upload(
        key: string,
        data: ReadableStream | ArrayBuffer | string | Blob,
        metadata?: {
            contentType?: string;
            customMetadata?: Record<string, string>;
        },
    ): Promise<UploadResult>;
    /**
     * Download a file from storage
     */
    download(key: string): Promise<DownloadResult>;
    /**
     * Get file metadata without downloading
     */
    getMetadata(key: string): Promise<{
        success: boolean;
        size?: number;
        etag?: string;
        contentType?: string;
        uploaded?: Date;
        customMetadata?: Record<string, string>;
        error?: string;
    }>;
    /**
     * Delete a file from storage
     */
    delete(key: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Delete multiple files
     */
    deleteMultiple(keys: string[]): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Check if a file exists
     */
    exists(key: string): Promise<boolean>;
    /**
     * List files in storage
     */
    list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
        success: boolean;
        files: Array<{
            key: string;
            size: number;
            etag: string;
            uploaded: Date;
        }>;
        cursor?: string;
        error?: string;
    }>;
    /**
     * Get a signed URL for temporary access (if using R2 with public access)
     */
    getPublicUrl(key: string): Promise<string>;
    /**
     * Get the raw R2 binding for advanced usage
     */
    getBinding(): R2Bucket;
};
type StorageService = ReturnType<typeof createStorage>;

/**
 * Queue Module
 *
 * Provides createQueue() for Queue handling in Cloudflare Workers.
 */

interface QueueOptions {
    binding: Queue<unknown>;
}
interface QueueMessage<T = unknown> {
    id: string;
    body: T;
    timestamp: number;
    attempts: number;
}
interface SendResult {
    success: boolean;
    error?: string;
}
interface QueueHandler<T = unknown> {
    (message: T): Promise<void> | void;
}
/**
 * Create a queue service
 *
 * @example
 * ```typescript
 * const queue = createQueue({
 *   binding: env.MY_QUEUE
 * });
 *
 * // Send a message to the queue
 * await queue.send({ type: 'send-email', to: 'user@example.com' });
 *
 * // Send multiple messages
 * await queue.sendBatch([
 *   { type: 'send-email', to: 'user1@example.com' },
 *   { type: 'send-email', to: 'user2@example.com' }
 * ]);
 * ```
 */
declare function createQueue<T = unknown>(
    options: QueueOptions,
): {
    /**
     * Send a single message to the queue
     */
    send(
        body: T,
        options?: {
            delaySeconds?: number;
        },
    ): Promise<SendResult>;
    /**
     * Send multiple messages to the queue
     */
    sendBatch(messages: T[]): Promise<SendResult>;
    /**
     * Get the raw Queue binding for advanced usage
     */
    getBinding(): Queue<unknown>;
};
/**
 * Create a queue consumer handler
 *
 * @example
 * ```typescript
 * const emailQueue = createQueue({ binding: env.EMAIL_QUEUE });
 *
 * export default {
 *   async fetch(request, env, ctx) {
 *     // Regular HTTP handler
 *   },
 *
 *   async queue(batch, env, ctx) {
 *     // Queue consumer handler
 *     const handler = createQueueConsumer(async (message) => {
 *       console.log('Processing:', message);
 *       // Process the message
 *     });
 *
 *     await handler(batch, env, ctx);
 *   }
 * };
 * ```
 */
declare function createQueueConsumer<T = unknown>(
    processor: QueueHandler<T>,
): (batch: MessageBatch<T>, _env: unknown, _ctx: ExecutionContext) => Promise<void>;
type QueueService<T = unknown> = ReturnType<typeof createQueue<T>>;

type MessageBatch<T> = {
    queue: string;
    messages: Array<{
        id: string;
        timestamp: Date;
        body: T;
        attempts: number;
        ack: () => void;
        retry: () => void;
    }>;
};

/**
 * Logging Module
 *
 * Provides createLogger() for structured logging.
 */
interface LoggerOptions {
    level?: "debug" | "info" | "warn" | "error";
    service?: string;
    environment?: string;
}
interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    service?: string;
    environment?: string;
    data?: Record<string, unknown>;
}
/**
 * Create a structured logger
 *
 * @example
 * ```typescript
 * const logger = createLogger({
 *   level: 'info',
 *   service: 'my-api',
 *   environment: 'production'
 * });
 *
 * // Log messages
 * logger.debug('Debug information', { userId: '123' });
 * logger.info('User logged in', { userId: '123' });
 * logger.warn('Rate limit approaching', { userId: '123' });
 * logger.error('Failed to save user', { error: err.message });
 * ```
 */
declare function createLogger(options?: LoggerOptions): {
    /**
     * Log debug message
     */
    debug(message: string, data?: Record<string, unknown>): void;
    /**
     * Log info message
     */
    info(message: string, data?: Record<string, unknown>): void;
    /**
     * Log warning message
     */
    warn(message: string, data?: Record<string, unknown>): void;
    /**
     * Log error message
     */
    error(message: string, data?: Record<string, unknown>): void;
    /**
     * Create a child logger with additional context
     */
    child(additionalContext: Record<string, unknown>): {
        debug(message: string, data?: Record<string, unknown>): void;
        info(message: string, data?: Record<string, unknown>): void;
        warn(message: string, data?: Record<string, unknown>): void;
        error(message: string, data?: Record<string, unknown>): void;
        child(nestedContext: Record<string, unknown>): /*elided*/ any;
        getLevel(): string;
    };
    /**
     * Get current log level
     */
    getLevel(): string;
};
type Logger$1 = ReturnType<typeof createLogger>;

/**
 * Security Module
 *
 * Provides rate limiting and validation utilities.
 */

interface RateLimitOptions {
    maxRequests: number;
    windowSeconds: number;
    keyGenerator?: (request: Request) => string;
}
interface ValidationSchema {
    [key: string]: {
        type: "string" | "number" | "boolean" | "email";
        required?: boolean;
        minLength?: number;
        maxLength?: number;
        pattern?: RegExp;
    };
}
/**
 * Create rate limiting middleware
 *
 * ⚠️ WARNING: This rate limiter uses an in-memory Map which has limitations:
 * - It does not share state across Cloudflare Worker isolates (each request may hit a different isolate)
 * - The map grows unbounded and resets on cold starts
 * - For production use, consider using KV or D1 for distributed rate limiting
 *
 * @example
 * ```typescript
 * app.use(rateLimit({
 *   maxRequests: 100,
 *   windowSeconds: 60
 * }));
 * ```
 */
declare function rateLimit(options: RateLimitOptions): Middleware;
/**
 * Create request validation middleware
 *
 * @example
 * ```typescript
 * app.use(validateRequest({
 *   email: { type: 'email', required: true },
 *   name: { type: 'string', required: true, minLength: 2, maxLength: 100 }
 * }));
 * ```
 */
declare function validateRequest(schema: ValidationSchema): Middleware;

/**
 * Cloudflare Kit Error System
 *
 * Structured error handling with operational and programming error distinction.
 */
/**
 * Base error class for all Cloudflare Kit errors
 */
declare class CloudflareKitError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly isOperational: boolean;
    readonly timestamp: string;
    constructor(message: string, code: string, statusCode?: number, isOperational?: boolean);
    /**
     * Serialize error to JSON format for API responses
     */
    toJSON(): Record<string, unknown>;
    /**
     * Create a Response object from this error
     */
    toResponse(): Response;
}
/**
 * HTTP-specific errors with status codes
 */
declare class HttpError extends CloudflareKitError {
    constructor(message: string, statusCode?: number, code?: string);
    static badRequest(message?: string): HttpError;
    static unauthorized(message?: string): HttpError;
    static forbidden(message?: string): HttpError;
    static notFound(message?: string): HttpError;
    static methodNotAllowed(message?: string): HttpError;
    static conflict(message?: string): HttpError;
    static unprocessable(message?: string): HttpError;
    static tooManyRequests(message?: string, retryAfter?: number): RateLimitError;
    static internal(message?: string): HttpError;
    static notImplemented(message?: string): HttpError;
    static badGateway(message?: string): HttpError;
    static serviceUnavailable(message?: string): HttpError;
}
/**
 * Validation errors for input validation failures
 */
declare class ValidationError extends CloudflareKitError {
    readonly field?: string;
    readonly errors: Array<{
        field: string;
        message: string;
        code?: string;
    }>;
    constructor(
        message: string,
        field?: string,
        errors?: Array<{
            field: string;
            message: string;
            code?: string;
        }>,
    );
    toJSON(): Record<string, unknown>;
    static fromZodError(zodError: {
        issues: Array<{
            path: (string | number)[];
            message: string;
            code: string;
        }>;
    }): ValidationError;
}
/**
 * Authentication and authorization errors
 */
declare class AuthError extends CloudflareKitError {
    constructor(message: string, code?: string);
    static invalidToken(message?: string): AuthError;
    static missingToken(message?: string): AuthError;
    static expiredToken(message?: string): AuthError;
    static insufficientPermissions(message?: string): AuthError;
    static invalidCredentials(message?: string): AuthError;
}
/**
 * Rate limiting errors with retry information
 */
declare class RateLimitError extends CloudflareKitError {
    readonly retryAfter?: number;
    readonly limit?: number;
    readonly remaining?: number;
    readonly resetTime?: number;
    constructor(message?: string, retryAfter?: number, limit?: number, remaining?: number, resetTime?: number);
    toResponse(): Response;
    toJSON(): Record<string, unknown>;
}
/**
 * Database operation errors
 */
declare class DatabaseError extends CloudflareKitError {
    readonly query?: string;
    readonly originalError?: Error;
    constructor(message: string, query?: string, originalError?: Error);
}
/**
 * Cache operation errors
 */
declare class CacheError extends CloudflareKitError {
    readonly key?: string;
    constructor(message: string, key?: string);
}
/**
 * Configuration errors
 */
declare class ConfigError extends CloudflareKitError {
    readonly key?: string;
    constructor(message: string, key?: string);
}
/**
 * Plugin errors
 */
declare class PluginError extends CloudflareKitError {
    readonly pluginName?: string;
    constructor(message: string, pluginName?: string);
}
/**
 * Type guard to check if error is a CloudflareKitError
 */
declare function isCloudflareKitError(error: unknown): error is CloudflareKitError;
/**
 * Type guard to check if error is an operational error
 */
declare function isOperationalError(error: unknown): boolean;
/**
 * Global error handler for unhandled errors
 */
declare function handleError(error: unknown): Response;

/**
 * Rate Limiter Types
 *
 * Pluggable rate limiting with support for multiple storage backends.
 */

/**
 * Rate limit store interface
 * Implement this to create custom storage backends
 */
interface RateLimitStore {
    /**
     * Get the current rate limit data for a key
     */
    get(key: string): Promise<RateLimitData | null>;
    /**
     * Set rate limit data with TTL
     */
    set(key: string, data: RateLimitData, ttlSeconds: number): Promise<void>;
    /**
     * Increment the counter atomically
     * Returns the new data or null if key doesn't exist
     */
    increment(key: string): Promise<RateLimitData | null>;
    /**
     * Reset the counter for a key
     */
    reset(key: string): Promise<void>;
}
/**
 * Rate limit data structure
 */
interface RateLimitData {
    count: number;
    resetAt: number;
    limit: number;
    window: number;
}
/**
 * Rate limit result
 */
interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
}
/**
 * Rate limiter configuration
 */
interface RateLimiterConfig {
    /**
     * Storage backend
     */
    store: RateLimitStore;
    /**
     * Maximum number of requests allowed in the window
     * @default 100
     */
    maxRequests?: number;
    /**
     * Time window in seconds
     * @default 60
     */
    windowSeconds?: number;
    /**
     * Function to generate the rate limit key from the request
     * @default Uses CF-Connecting-IP header or 'unknown'
     */
    keyGenerator?: (request: Request) => string;
    /**
     * Skip rate limiting for certain requests
     */
    skip?: (request: Request) => boolean;
    /**
     * Custom error message
     */
    message?: string;
}
/**
 * Rate limiter interface
 */
interface RateLimiter {
    /**
     * Check if a request is allowed
     */
    check(request: Request): Promise<RateLimitResult>;
    /**
     * Consume a request (increment counter)
     * Throws RateLimitError if limit exceeded
     */
    consume(request: Request): Promise<RateLimitResult>;
    /**
     * Reset rate limit for a key
     */
    reset(key: string): Promise<void>;
    /**
     * Get current status without consuming
     */
    status(request: Request): Promise<RateLimitResult>;
}

/**
 * Memory-based Rate Limit Store
 *
 * For development use only. Not suitable for production with multiple Worker instances.
 */

/**
 * Create an in-memory rate limit store
 *
 * ⚠️ WARNING: This store is for development only. Data is not shared
 * across Cloudflare Worker instances and will be lost on cold starts.
 * Use KVRateLimitStore for production.
 */
declare function createMemoryRateLimitStore(): RateLimitStore;

/**
 * KV-based Rate Limit Store
 *
 * Production-ready distributed rate limiting using Cloudflare KV.
 */

/**
 * Configuration for KV rate limit store
 */
interface KVRateLimitConfig {
    /**
     * KV namespace binding
     */
    binding: KVNamespace;
    /**
     * Key prefix for rate limit entries
     * @default 'ratelimit:'
     */
    prefix?: string;
}
/**
 * Create a KV-based rate limit store for production use
 *
 * This store provides distributed rate limiting across all Cloudflare
 * Worker instances. Use this in production environments.
 *
 * @example
 * ```typescript
 * const store = createKVRateLimitStore({
 *   binding: env.RATE_LIMIT_KV,
 *   prefix: 'api:'
 * });
 *
 * const limiter = createRateLimiter({
 *   store,
 *   maxRequests: 100,
 *   windowSeconds: 60
 * });
 * ```
 */
declare function createKVRateLimitStore(config: KVRateLimitConfig): RateLimitStore;

/**
 * Rate Limiter
 *
 * Enterprise-grade rate limiting with pluggable storage backends.
 */

/**
 * Create a rate limiter
 *
 * @example
 * ```typescript
 * // Development - Memory store
 * const devLimiter = createRateLimiter({
 *   store: createMemoryRateLimitStore(),
 *   maxRequests: 100,
 *   windowSeconds: 60
 * });
 *
 * // Production - KV store
 * const prodLimiter = createRateLimiter({
 *   store: createKVRateLimitStore({ binding: env.RATE_LIMIT_KV }),
 *   maxRequests: 100,
 *   windowSeconds: 60,
 *   keyGenerator: (req) => req.headers.get('CF-Connecting-IP') ?? 'anonymous'
 * });
 * ```
 */
declare function createRateLimiter(config: RateLimiterConfig): RateLimiter;

/**
 * Plugin System Types
 *
 * Defines the interfaces for the extensible plugin architecture.
 */
interface Logger {
    debug(message: string, data?: Record<string, unknown>): void;
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(message: string, data?: Record<string, unknown>): void;
}
interface RequestContext {
    request: Request;
    url: URL;
    env: Record<string, unknown>;
    executionContext: ExecutionContext;
    state: Record<string, unknown>;
}
/**
 * Application interface that plugins interact with
 */
interface App {
    readonly name: string;
    readonly version: string;
    readonly config: Record<string, unknown>;
    readonly logger: Logger;
    /**
     * Register a hook listener
     */
    on<K extends keyof PluginHooks>(event: K, handler: PluginHooks[K]): void;
    /**
     * Emit a hook event
     */
    emit<K extends keyof PluginHooks>(event: K, ...args: Parameters<NonNullable<PluginHooks[K]>>): Promise<void>;
    /**
     * Get a provider by name
     */
    getProvider<T>(name: string): T | undefined;
    /**
     * Set a provider
     */
    setProvider<T>(name: string, provider: T): void;
}
/**
 * Plugin context passed during installation
 */
interface PluginContext {
    /**
     * The application instance
     */
    app: App;
    /**
     * Application configuration
     */
    config: Record<string, unknown>;
    /**
     * Logger instance
     */
    logger: Logger;
    /**
     * Environment bindings
     */
    env?: Record<string, unknown>;
}
/**
 * Plugin hook definitions
 */
interface PluginHooks {
    /**
     * Called when the application is initializing
     */
    "app:init": (app: App) => void | Promise<void>;
    /**
     * Called when the application is shutting down
     */
    "app:shutdown": (app: App) => void | Promise<void>;
    /**
     * Called at the start of request processing
     */
    "request:start": (ctx: RequestContext) => void | Promise<void>;
    /**
     * Called at the end of request processing (before response sent)
     */
    "request:end": (ctx: RequestContext, response: Response) => void | Promise<void>;
    /**
     * Called when an error occurs during request processing
     */
    "request:error": (ctx: RequestContext, error: Error) => void | Promise<void>;
    /**
     * Called when a route is registered
     */
    "route:register": (method: string, path: string) => void | Promise<void>;
    /**
     * Called when middleware is registered
     */
    "middleware:register": (name: string) => void | Promise<void>;
}
/**
 * Plugin interface
 */
interface Plugin {
    /**
     * Unique plugin name
     */
    name: string;
    /**
     * Plugin version (semver)
     */
    version: string;
    /**
     * Plugin description
     */
    description?: string;
    /**
     * Plugin author
     */
    author?: string;
    /**
     * Plugin dependencies (names of other plugins that must be loaded first)
     */
    dependencies?: string[];
    /**
     * Install function called when plugin is registered
     */
    install: (context: PluginContext) => void | Promise<void>;
    /**
     * Optional hook handlers
     */
    hooks?: {
        [K in keyof PluginHooks]?: PluginHooks[K];
    };
}
/**
 * Plugin configuration options
 */
interface PluginOptions {
    /**
     * Enable/disable plugin
     */
    enabled?: boolean;
    /**
     * Plugin-specific configuration
     */
    config?: Record<string, unknown>;
    /**
     * Priority (lower numbers load first)
     */
    priority?: number;
}
/**
 * Hook handler type
 */
type HookHandler<T extends keyof PluginHooks> = NonNullable<PluginHooks[T]>;

/**
 * Plugin Registry
 *
 * Manages plugin registration, dependencies, and lifecycle.
 */

/**
 * Plugin Registry class
 */
declare class PluginRegistry {
    private plugins;
    private hooks;
    private installedOrder;
    /**
     * Register a plugin
     */
    register(plugin: Plugin, options?: PluginOptions): void;
    /**
     * Unregister a plugin
     */
    unregister(name: string): void;
    /**
     * Install all registered plugins
     */
    installAll(context: PluginContext): Promise<void>;
    /**
     * Get sorted plugins by priority and dependencies
     */
    private getSortedPlugins;
    /**
     * Register a hook handler
     */
    on<K extends keyof PluginHooks>(event: K, handler: PluginHooks[K]): void;
    /**
     * Unregister a hook handler
     */
    off<K extends keyof PluginHooks>(event: K, handler: PluginHooks[K]): void;
    /**
     * Emit a hook event to all registered handlers
     */
    emit<K extends keyof PluginHooks>(event: K, ...args: Parameters<NonNullable<PluginHooks[K]>>): Promise<void>;
    /**
     * Get a plugin by name
     */
    get(name: string): Plugin | undefined;
    /**
     * Check if a plugin is registered
     */
    has(name: string): boolean;
    /**
     * Check if a plugin is installed
     */
    isInstalled(name: string): boolean;
    /**
     * Get all registered plugin names
     */
    get names(): string[];
    /**
     * Get all installed plugin names
     */
    get installedNames(): string[];
    /**
     * Clear all plugins
     */
    clear(): void;
}
/**
 * Global plugin registry instance
 */
declare const globalRegistry: PluginRegistry;

/**
 * Define a plugin with type safety
 */
declare function definePlugin(plugin: {
    name: string;
    version: string;
    description?: string;
    author?: string;
    dependencies?: string[];
    install: (context: PluginContext) => void | Promise<void>;
    hooks?: Partial<PluginHooks>;
}): Plugin;
/**
 * Create a plugin from a factory function
 */
declare function createPlugin(
    factory: (options?: Record<string, unknown>) => Plugin,
): (options?: Record<string, unknown>) => Plugin;
/**
 * Compose multiple plugins into one
 */
declare function composePlugins(name: string, version: string, ...plugins: Plugin[]): Plugin;

export {
    type App,
    type AppOptions,
    AuthError,
    type AuthOptions,
    type AuthResult,
    type CacheEntry,
    CacheError,
    type CacheOptions,
    type CacheService,
    CloudflareKitError,
    ConfigError,
    type D1Database,
    type D1Result,
    DatabaseError,
    type DatabaseOptions,
    type DatabaseService,
    type DownloadResult,
    type Handler,
    type HookHandler,
    HttpError,
    type LogEntry,
    type Logger$1 as Logger,
    type LoggerOptions,
    type Middleware,
    type Plugin,
    type PluginContext,
    PluginError,
    type PluginHooks,
    PluginRegistry,
    type QueueHandler,
    type QueueMessage,
    type QueueOptions,
    type QueueService,
    type RateLimitData,
    RateLimitError,
    type RateLimitOptions,
    type RateLimitResult,
    type RateLimitStore,
    type RateLimiter,
    type RateLimiterConfig,
    type RequestContext$1 as RequestContext,
    type SendResult,
    type Session,
    type StorageOptions,
    type StorageService,
    type UploadResult,
    type User,
    ValidationError,
    type ValidationSchema,
    composePlugins,
    corsMiddleware,
    createApp,
    createAuth,
    createCache,
    createDatabase,
    createKVRateLimitStore,
    createLogger,
    createMemoryRateLimitStore,
    createPlugin,
    createQueue,
    createQueueConsumer,
    createRateLimiter,
    createStorage,
    definePlugin,
    errorResponse,
    globalRegistry,
    handleError,
    isCloudflareKitError,
    isOperationalError,
    jsonMiddleware,
    jsonResponse,
    rateLimit,
    redirectResponse,
    securityHeadersMiddleware,
    successResponse,
    validateRequest,
};
