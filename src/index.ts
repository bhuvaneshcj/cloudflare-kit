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
export type { RouterContext, Router, App } from "./core/app";

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
export type { Plugin, PluginContext, PluginHooks, App as PluginApp, HookHandler } from "./plugins/types";

// ============================================================
// NEW FEATURES FOR v2.0
// ============================================================

// Validation (Feature 3)
export { v, createValidator } from "./validation/index";
export type {
    Schema,
    ValidationResult,
    ValidationErrorDetail,
    ValidatorConfig,
    InferSchema,
    ValidatedContext,
} from "./validation/index";

// WebSocket (Feature 4)
export { createWebSocketHandler, createDurableWebSocket } from "./websocket/index";
export type {
    WebSocketContext,
    WebSocketHandlerOptions,
    DurableWebSocketContext,
    DurableWebSocketHandlerOptions,
    DurableObjectState,
    DurableObjectStorage,
} from "./websocket/index";

// OAuth (Feature 5)
export { createOAuth } from "./oauth/index";
export type {
    OAuthProvider,
    OAuthUser,
    TokenResult,
    OAuthResult,
    OAuthOptions,
    OAuthClient,
    AuthUrlResult,
} from "./oauth/index";

// Scheduler (Feature 6)
export { createScheduler, createScheduledApp, createScheduledWorker } from "./scheduler/index";
export type { ScheduledEvent, ScheduledHandler, Scheduler, ScheduledApp } from "./scheduler/index";

// Email (Feature 7)
export { createMailer } from "./email/index";
export type {
    SendEmail,
    EmailMessage,
    EmailAddress,
    EmailOptions,
    MailerOptions,
    EmailResult,
    Mailer,
} from "./email/index";

// Analytics (Feature 8)
export { createAnalytics } from "./analytics/index";
export type { AnalyticsEngineDataset, AnalyticsOptions, AnalyticsService, Analytics } from "./analytics/index";

// AI (Feature 9)
export { createAI } from "./ai/index";
export type { Ai, AiRunOptions, AIOptions, AIService } from "./ai/index";

// Testing (Feature 10)
export {
    createTestApp,
    mockRequest,
    mockEnv,
    createMockKV,
    createMockD1,
    createMockR2,
    createMockExecutionContext,
    expectJSON,
    expectStatus,
} from "./testing/index";
export type {
    MockRequestOptions,
    TestResponse,
    TestApp,
    MockKVNamespace,
    MockD1Database,
    MockR2Bucket,
    MockEnv,
} from "./testing/index";

// OpenAPI (Feature 11)
export { createOpenAPI, defineRoute } from "./openapi/index";
export type {
    OpenAPIInfo,
    OpenAPIServer,
    OpenAPISchema,
    OpenAPIParameter,
    OpenAPIRequestBody,
    OpenAPIResponse,
    RouteMetadata,
    OpenAPIOptions,
    OpenAPISpec,
    OpenAPIService,
} from "./openapi/index";

// Streaming (Feature 12)
export {
    createSSE,
    streamJSON,
    createStreamResponse,
    createTextStream,
    createNDJSONStream,
    pipeStream,
} from "./streaming/index";
export type { SSEEvent, SSEHelper, StreamWriter } from "./streaming/index";
