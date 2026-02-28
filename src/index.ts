/**
 * Cloudflare Kit
 *
 * The all-in-one toolkit for building Cloudflare Workers.
 * Simple, clear, beginner-friendly APIs.
 *
 * @example
 * ```typescript
 * import {
 *   createApp,
 *   createAuth,
 *   createDatabase,
 *   createCache,
 *   createStorage,
 *   createQueue,
 *   createLogger
 * } from 'cloudflare-kit';
 *
 * const app = createApp();
 *
 * export default app;
 * ```
 */

// Core
export { createApp } from "./core/app";
export { jsonResponse, errorResponse, successResponse, redirectResponse } from "./core/response";
export { corsMiddleware, jsonMiddleware, securityHeadersMiddleware } from "./core/middleware";
export type { Middleware, RequestContext, AppOptions, Handler } from "./core/types";

// Auth
export { createAuth } from "./auth/index";
export type { AuthOptions, User, Session, AuthResult } from "./auth/index";

// Database
export { createDatabase } from "./database/index";
export type { D1Database, D1Result, DatabaseOptions, DatabaseService } from "./database/index";

// Cache
export { createCache } from "./cache/index";
export type { CacheOptions, CacheService, CacheEntry } from "./cache/index";

// Storage
export { createStorage } from "./storage/index";
export type { StorageOptions, StorageService, UploadResult, DownloadResult } from "./storage/index";

// Queue
export { createQueue, createQueueConsumer } from "./queue/index";
export type { QueueOptions, QueueService, QueueMessage, SendResult, QueueHandler } from "./queue/index";

// Logging
export { createLogger } from "./logging/index";
export type { Logger, LoggerOptions, LogEntry } from "./logging/index";

// Security
export { rateLimit, validateRequest } from "./security/index";
export type { RateLimitOptions, ValidationSchema } from "./security/index";

// Rate Limiter (Enterprise)
export { createRateLimiter, createMemoryRateLimitStore, createKVRateLimitStore } from "./security/rate-limiter/index";
export type {
    RateLimiter,
    RateLimiterConfig,
    RateLimitResult,
    RateLimitStore,
    RateLimitData,
} from "./security/rate-limiter/types";

// Errors (Enterprise)
export {
    CloudflareKitError,
    HttpError,
    ValidationError,
    AuthError,
    RateLimitError,
    DatabaseError,
    CacheError,
    ConfigError,
    PluginError,
    isCloudflareKitError,
    isOperationalError,
    handleError,
} from "./errors/index";

// Plugins (Enterprise)
export { definePlugin, createPlugin, composePlugins, PluginRegistry, globalRegistry } from "./plugins/index";
export type { Plugin, PluginContext, PluginHooks, App, HookHandler } from "./plugins/types";
