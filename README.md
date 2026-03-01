# cloudflare-kit

The all-in-one toolkit for building Cloudflare Workers with routing, auth, database, caching, storage, and more.

[![npm version](https://img.shields.io/npm/v/cloudflare-kit.svg)](https://www.npmjs.com/package/cloudflare-kit) [![npm downloads](https://img.shields.io/npm/dm/cloudflare-kit.svg)](https://www.npmjs.com/package/cloudflare-kit) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/bhuvaneshcj/cloudflare-kit/blob/main/LICENSE) [![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue)](https://www.typescriptlang.org/) [![Bundle Size](https://img.shields.io/badge/bundle-~55KB-green.svg)](https://bundlephobia.com/package/cloudflare-kit)

---

## Why cloudflare-kit?

Building Cloudflare Workers means juggling D1, KV, R2, Queues, and WebSockets with no standard framework. You end up writing boilerplate for routing, auth, and error handling instead of building features. cloudflare-kit gives you everything in one consistent API that feels familiar. It feels like Express, but it's built for the edge.

## Quick Install

```bash
npm install cloudflare-kit
```

```bash
pnpm add cloudflare-kit
```

```bash
yarn add cloudflare-kit
```

## See it in action

```typescript
import {
    createApp,
    createAuth,
    createDatabase,
    createCache,
    createLogger,
    corsMiddleware,
    jsonMiddleware,
    requireAuth,
    v,
    createValidator,
} from "cloudflare-kit";

interface Env {
    JWT_SECRET: string;
    DB: D1Database;
    CACHE: KVNamespace;
}

const app = createApp();
const logger = createLogger({ level: "info" });
const auth = createAuth({ secret: (env) => env.JWT_SECRET });
const db = createDatabase({ binding: (env) => env.DB });
const cache = createCache({ binding: (env) => env.CACHE });

// Global middleware
app.use(corsMiddleware());
app.use(jsonMiddleware());
app.use(logger.requestLogger());

// Auth routes
app.post("/auth/login", async (ctx) => {
    const { email, password } = ctx.body as { email: string; password: string };
    const user = await db.get<{ id: string; email: string }>(
        "SELECT * FROM users WHERE email = ? AND password_hash = ?",
        [email, await hashPassword(password)],
    );
    if (!user) return errorResponse("Invalid credentials", 401);
    const token = await auth.createToken({ sub: user.id, email: user.email });
    return jsonResponse({ token, user: { id: user.id, email: user.email } });
});

// Protected API with validation
const userSchema = v.object({
    name: v.string().minLength(2).maxLength(100),
    email: v.email(),
    age: v.number().min(18).optional(),
});

app.post("/api/users", requireAuth(auth), createValidator(userSchema), async (ctx) => {
    const userData = ctx.body as { name: string; email: string; age?: number };
    const cacheKey = `user:email:${userData.email}`;
    return cache.getOrSet(
        cacheKey,
        async () => {
            const result = await db.execute("INSERT INTO users (name, email, age) VALUES (?, ?, ?)", [
                userData.name,
                userData.email,
                userData.age || null,
            ]);
            return jsonResponse({ id: result.meta.last_row_id, ...userData }, 201);
        },
        300,
    );
});

// Dynamic routes
app.get("/api/users/:id", async (ctx) => {
    const cacheKey = `user:${ctx.params.id}`;
    const user = await cache.getOrSet(cacheKey, () => db.get("SELECT * FROM users WHERE id = ?", [ctx.params.id]), 300);
    if (!user) return errorResponse("User not found", 404);
    return jsonResponse(user);
});

export default app;
```

## Features

| Module                     | What it does                                        | Cloudflare Primitive |
| -------------------------- | --------------------------------------------------- | -------------------- |
| **createApp**              | HTTP router with dynamic routes, groups, middleware | Built-in             |
| **createAuth**             | JWT tokens and session management                   | Built-in             |
| **createDatabase**         | D1 database wrapper with transactions               | D1                   |
| **createCache**            | KV caching with tags and batch operations           | KV                   |
| **createStorage**          | R2 file storage with streaming and multipart        | R2                   |
| **createQueue**            | Message queue producer and consumer                 | Queue                |
| **createLogger**           | Structured logging with request IDs                 | Built-in             |
| **rateLimit**              | Rate limiting with memory or KV backing             | KV (optional)        |
| **Validation**             | Schema builder and validator middleware             | Built-in             |
| **createWebSocketHandler** | WebSocket server with Durable Object support        | WebSocket            |
| **createOAuth**            | OAuth 2.0 for Google, GitHub, Discord               | Built-in             |
| **createScheduler**        | Cron job scheduling                                 | Built-in             |
| **createMailer**           | Email sending via MailChannels                      | Email                |
| **createAnalytics**        | Analytics Engine wrapper                            | Analytics Engine     |
| **createAI**               | Workers AI for text, embeddings, streaming          | AI                   |
| **createSSE**              | Server-Sent Events and streaming responses          | Built-in             |
| **createOpenAPI**          | Auto-generated OpenAPI spec and Swagger UI          | Built-in             |
| **Testing**                | Mock bindings and test utilities                    | Built-in             |
| **Plugins**                | Plugin system with hooks and registry               | Built-in             |
| **Errors**                 | Typed error classes with HTTP status codes          | Built-in             |
| **Response Helpers**       | jsonResponse, errorResponse, redirectResponse       | Built-in             |
| **Middleware**             | CORS, JSON parsing, security headers                | Built-in             |

---

## Full API Reference

### createApp

HTTP router with Express-like API. Supports dynamic routes (`:id`), wildcards (`*`), route groups, and middleware chain with `next()`.

```typescript
import { createApp, createLogger, corsMiddleware, jsonMiddleware } from "cloudflare-kit";

const app = createApp({
    onError: (error, request) => {
        console.error(`Error handling ${request.url}:`, error);
        return errorResponse("Internal server error", 500);
    },
});

// Middleware
app.use(corsMiddleware({ origin: ["https://example.com"] }));
app.use(jsonMiddleware({ maxSize: "1mb" }));

// Routes
app.get("/health", () => jsonResponse({ status: "ok" }));
app.get("/users/:id", async (ctx) => {
    return jsonResponse({ id: ctx.params.id, query: ctx.query });
});
app.group("/api/v1", (router) => {
    router.get("/posts", listPosts);
    router.post("/posts", requireAuth, createPost);
});

export default app;
```

### createAuth

JWT authentication with HS256. Create tokens, verify them, and extract user data.

```typescript
import { createAuth } from "cloudflare-kit";

const auth = createAuth({
    secret: (env) => env.JWT_SECRET, // Must be 32+ characters
    expiresIn: 86400, // 24 hours
    issuer: "my-app",
    audience: "api",
});

// Create token
const token = await auth.createToken({ sub: "user-123", email: "john@example.com", role: "admin" });

// Verify token
const result = await auth.verifyToken(token);
if (result.success) {
    console.log(result.payload.sub); // user-123
}

// Middleware usage
app.get("/profile", requireAuth(auth), async (ctx) => {
    return jsonResponse({ userId: ctx.user.sub });
});
```

### requireAuth

Middleware factory that protects routes. Extracts token from Authorization header, verifies it, and attaches user to context.

```typescript
import { requireAuth, createAuth } from "cloudflare-kit";

const auth = createAuth({ secret: (env) => env.JWT_SECRET });
const requireUser = requireAuth(auth);
const requireAdmin = requireAuth(auth, { roles: ["admin"] });

// Protect single route
app.get("/api/protected", requireUser, (ctx) => {
    return jsonResponse({ userId: ctx.user.sub });
});

// Require specific role
app.delete("/api/users/:id", requireAdmin, deleteUserHandler);
```

### createDatabase

D1 database wrapper with typed queries, transactions, and convenience methods.

```typescript
import { createDatabase } from "cloudflare-kit";

interface User {
    id: number;
    email: string;
    name: string;
    created_at: string;
}

const db = createDatabase({ binding: (env) => env.DB });

// Get single row
const user = await db.get<User>("SELECT * FROM users WHERE id = ?", [userId]);

// Get multiple rows
const users = await db.query<User>("SELECT * FROM users WHERE active = ?", [true]);

// Insert and get last ID
const result = await db.execute("INSERT INTO users (email, name) VALUES (?, ?)", ["john@example.com", "John Doe"]);
console.log(result.meta.last_row_id);

// Transaction
await db.transaction(async (txn) => {
    await txn.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?", [100, fromId]);
    await txn.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?", [100, toId]);
});
```

### createCache

KV cache with advanced features like cache tags, batch operations, and conditional fetching.

```typescript
import { createCache } from "cloudflare-kit";

const cache = createCache({ binding: (env) => env.CACHE });

// Basic operations
await cache.set("key", { data: "value" }, 300); // TTL 5 minutes
const value = await cache.get<{ data: string }>("key");
await cache.delete("key");

// Get or set (cache-aside pattern)
const user = await cache.getOrSet(
    `user:${userId}`,
    async () => db.get("SELECT * FROM users WHERE id = ?", [userId]),
    600,
);

// Cache tags for invalidation
await cache.setWithTags("user:123", userData, ["users", "user:123"], 600);
await cache.setWithTags("post:456", postData, ["posts", "user:123"], 600);
await cache.invalidateByTag("user:123"); // Deletes both entries

// Batch operations
await cache.setMany(
    {
        key1: "value1",
        key2: "value2",
        key3: "value3",
    },
    300,
);

const values = await cache.getMany(["key1", "key2", "key3"]);
// { key1: 'value1', key2: 'value2', key3: 'value3' }
```

### createStorage

R2 object storage with streaming uploads, multipart support, signed URLs, and batch operations.

```typescript
import { createStorage } from "cloudflare-kit";

const storage = createStorage({
    binding: (env) => env.BUCKET,
    maxFileSize: 100 * 1024 * 1024, // 100MB
    allowedMimeTypes: ["image/*", "application/pdf"],
});

// Upload from request (auto-detects multipart if needed)
app.post("/upload", async (ctx) => {
    const result = await storage.uploadFromRequest(ctx.request, {
        key: `uploads/${crypto.randomUUID()}`,
    });
    return jsonResponse({ url: result.url, size: result.size });
});

// Streaming upload for large files
app.post("/upload-stream", async (ctx) => {
    const stream = ctx.request.body;
    if (!stream) return errorResponse("No body", 400);
    const result = await storage.uploadStream(`videos/${id}.mp4`, stream, {
        contentType: "video/mp4",
    });
    return jsonResponse(result);
});

// Multipart upload for very large files
const multipart = await storage.createMultipartUpload("large-file.zip");
// Upload parts...
await storage.completeMultipartUpload(multipart.uploadId, parts);

// Signed URL for direct browser upload
const signedUrl = await storage.createSignedUploadUrl("user-uploads/${userId}/${filename}", {
    expiresIn: 3600,
    maxSize: 10 * 1024 * 1024,
});

// Range download for video streaming
app.get("/videos/:key", async (ctx) => {
    const range = ctx.request.headers.get("Range");
    const result = await storage.download(ctx.params.key, { range });
    return new Response(result.body, {
        status: range ? 206 : 200,
        headers: result.headers,
    });
});

// Batch delete
await storage.deleteMany(["old/file1.pdf", "old/file2.pdf"]);
```

### createQueue

Cloudflare Queue producer and consumer with batch processing.

```typescript
import { createQueue, createQueueConsumer } from "cloudflare-kit";

interface EmailJob {
    type: "send-email";
    to: string;
    subject: string;
    body: string;
}

const queue = createQueue<EmailJob>({ binding: (env) => env.QUEUE });

// Send message
await queue.send({ type: "send-email", to: "user@example.com", subject: "Welcome", body: "..." });

// Send batch
await queue.sendBatch([
    { type: "send-email", to: "user1@example.com", subject: "Welcome", body: "..." },
    { type: "send-email", to: "user2@example.com", subject: "Welcome", body: "..." },
]);

// Consumer (in separate file)
export default createQueueConsumer<EmailJob>({
    queue: (env) => env.QUEUE,
    maxBatchSize: 10,
    maxBatchTimeout: 5,
    handler: async (messages, env) => {
        for (const message of messages) {
            await sendEmail(message.body);
            message.ack();
        }
    },
});
```

### createLogger

Structured logging with log levels, request IDs, and child loggers.

```typescript
import { createLogger } from "cloudflare-kit";

const logger = createLogger({
    level: "info",
    includeTimestamp: true,
    defaultFields: { service: "api", version: "1.0.0" },
});

// Log methods
logger.info("Server starting", { port: 8787 });
logger.warn("Rate limit approaching", { remaining: 10 });
logger.error("Database connection failed", { error: err.message });
logger.debug("Processing request", { id: requestId });

// Request logger middleware
app.use(logger.requestLogger());

// Child logger with context
const requestLogger = logger.child({ requestId: crypto.randomUUID() });
requestLogger.info("Processing payment", { amount: 99.99, currency: "USD" });
```

### rateLimit

Rate limiting with configurable stores (memory for single worker, KV for distributed).

```typescript
import { rateLimit, createRateLimiter, createKVRateLimitStore } from "cloudflare-kit";

// Simple in-memory rate limit (per worker instance)
app.get(
    "/api/public",
    rateLimit({
        windowMs: 60000, // 1 minute
        maxRequests: 100,
    }),
    publicHandler,
);

// Distributed rate limit with KV
const limiter = createRateLimiter({
    store: createKVRateLimitStore({ binding: (env) => env.RATE_LIMIT_KV }),
    windowMs: 60000,
    maxRequests: 100,
});

app.get("/api/expensive", async (ctx) => {
    const result = await limiter.check(ctx.request);
    if (!result.allowed) {
        return errorResponse("Rate limit exceeded", 429, {
            "Retry-After": String(result.retryAfter),
        });
    }
    return expensiveOperation();
});

// Per-user rate limiting
app.post("/api/login", async (ctx) => {
    const { email } = ctx.body as { email: string };
    const result = await limiter.check(ctx.request, { key: `login:${email}` });
    if (!result.allowed) {
        return errorResponse("Too many login attempts", 429);
    }
    // ... process login
});
```

### Validation (v + createValidator)

Zero-dependency schema builder with full TypeScript inference.

```typescript
import { v, createValidator } from "cloudflare-kit";

// Define schemas
const userSchema = v.object({
    name: v.string().minLength(2).maxLength(100),
    email: v.email(),
    age: v.number().min(18).max(120).optional(),
    website: v.url().optional(),
    tags: v.array(v.string().minLength(1)).optional(),
});

const loginSchema = v.object({
    email: v.email(),
    password: v.string().minLength(8),
});

// Create validator middleware
const validateUser = createValidator(userSchema, {
    source: "body", // 'body', 'query', or 'params'
    onError: (errors) => {
        return errorResponse("Validation failed", 422, { errors });
    },
});

// Use in routes
app.post("/api/users", validateUser, async (ctx) => {
    // ctx.body is now typed as { name: string; email: string; age?: number; ... }
    const userData = ctx.body;
    return jsonResponse(await createUser(userData));
});

// Manual validation
const result = userSchema.parse({ name: "John", email: "john@example.com" });
if (result.success) {
    console.log(result.data.name); // Fully typed
} else {
    console.log(result.errors);
}
```

### createWebSocketHandler

WebSocket server for real-time communication.

```typescript
import { createWebSocketHandler } from "cloudflare-kit";

const wsHandler = createWebSocketHandler({
    maxConnections: 100, // Connection limit
    onOpen: (ws, ctx) => {
        console.log("Client connected");
        ws.send(JSON.stringify({ type: "connected", id: crypto.randomUUID() }));
    },
    onMessage: (ws, message, ctx) => {
        const data = JSON.parse(message as string);
        // Broadcast to all connected clients
        ws.send(JSON.stringify({ type: "echo", data }));
    },
    onClose: (ws, code, reason, ctx) => {
        console.log("Client disconnected:", code, reason);
    },
    onError: (ws, error, ctx) => {
        console.error("WebSocket error:", error);
    },
});

app.get("/ws", wsHandler);

// Durable Object variant for stateful rooms
export class ChatRoom {
    private wsHandler;

    constructor(
        private state: DurableObjectState,
        private env: Env,
    ) {
        this.wsHandler = createDurableWebSocket({
            onOpen: (ws, ctx) => {
                ctx.durableState.getWebSockets().forEach((client) => {
                    if (client !== ws) {
                        client.send(JSON.stringify({ type: "user_joined" }));
                    }
                });
            },
            onMessage: (ws, message, ctx) => {
                // Broadcast to all clients in this room
                ctx.durableState.getWebSockets().forEach((client) => {
                    client.send(message as string);
                });
            },
        });
    }

    async fetch(request: Request) {
        return this.wsHandler.fetch(request, this.env);
    }
}
```

### createOAuth

OAuth 2.0 authentication with Google, GitHub, and Discord.

```typescript
import { createOAuth } from "cloudflare-kit";

const googleOAuth = createOAuth({
    provider: "google",
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: "https://api.example.com/auth/google/callback",
    scopes: ["openid", "email", "profile"],
});

// Generate auth URL
app.get("/auth/google", async (ctx) => {
    const state = crypto.randomUUID();
    await ctx.env.SESSIONS.put(`state:${state}`, "valid", { expirationTtl: 600 });
    const { url, codeVerifier } = await googleOAuth.getAuthUrl(state);
    await ctx.env.SESSIONS.put(`pkce:${state}`, codeVerifier, { expirationTtl: 600 });
    return redirectResponse(url);
});

// Handle callback
app.get("/auth/google/callback", async (ctx) => {
    const { code, state } = ctx.query;
    const codeVerifier = await ctx.env.SESSIONS.get(`pkce:${state}`);
    if (!codeVerifier) return errorResponse("Invalid state", 400);

    const result = await googleOAuth.handleCallback(code as string, state as string, codeVerifier);
    if (!result.success) return errorResponse(result.error!, 400);

    // Create user session
    const token = await auth.createToken({
        sub: result.user.id,
        email: result.user.email,
        name: result.user.name,
    });

    return redirectResponse(`https://app.example.com/auth?token=${token}`);
});
```

### createScheduler

Cron job scheduling with multiple cron patterns.

```typescript
import { createScheduler, createScheduledApp } from "cloudflare-kit";

const scheduler = createScheduler();

// Register cron jobs
scheduler.cron("0 0 * * *", async (event, env, ctx) => {
    // Daily cleanup
    await cleanupExpiredSessions();
});

scheduler.cron("0 */6 * * *", async (event, env, ctx) => {
    // Every 6 hours
    await syncExternalData();
});

scheduler.cron("*/5 * * * *", async (event, env, ctx) => {
    // Every 5 minutes
    await processQueueStats();
});

// Export for Cloudflare
export default createScheduledApp(app, scheduler);
// This creates a worker with both fetch and scheduled handlers
```

### createMailer

Email sending via MailChannels with template support.

```typescript
import { createMailer } from "cloudflare-kit";

const mailer = createMailer({
    from: { email: "noreply@example.com", name: "My App" },
});

// Simple email
await mailer.send({
    to: { email: "user@example.com", name: "John Doe" },
    subject: "Welcome to My App",
    text: "Thanks for signing up!",
    html: "<h1>Welcome!</h1><p>Thanks for signing up!</p>",
});

// With template
await mailer.sendTemplate(
    "welcome-email",
    { userName: "John", activationLink: "https://example.com/activate?token=abc" },
    { email: "user@example.com", name: "John Doe" },
);

// Batch email
await mailer.send({
    to: [
        { email: "user1@example.com", name: "User One" },
        { email: "user2@example.com", name: "User Two" },
    ],
    subject: "Newsletter",
    html: "<p>Monthly update...</p>",
});
```

### createAnalytics

Analytics Engine integration for metrics and events.

```typescript
import { createAnalytics } from "cloudflare-kit";

const analytics = createAnalytics({
    binding: (env) => env.ANALYTICS,
    dataset: "api_metrics",
});

// Track custom events
analytics.track("purchase", {
    amount: 99.99,
    currency: "USD",
    product_id: "prod_123",
    user_country: "US",
});

// Auto-track request metrics
app.use((ctx, next) => {
    const start = Date.now();
    analytics.trackRequest(ctx.request, { endpoint: ctx.url.pathname });
    return next();
});

// Increment counters
analytics.increment("api.requests", 1);
analytics.increment("cache.hits");

// Track timing
const start = Date.now();
await databaseQuery();
analytics.timing("db.query", Date.now() - start);
```

### createAI

Workers AI integration for text generation, embeddings, and streaming.

```typescript
import { createAI } from "cloudflare-kit";

const ai = createAI({
    binding: (env) => env.AI,
    gateway: { id: "my-gateway", cacheKey: "v1" }, // Optional AI Gateway
});

// Text generation
const summary = await ai.text(
    "Summarize this article in 3 bullet points: " + articleText,
    "@cf/meta/llama-3.1-8b-instruct",
);

// Embeddings
const embedding = await ai.embed("The quick brown fox", "@cf/baai/bge-small-en-v1.5");
// Returns number[]

// Batch embeddings
const embeddings = await ai.embed(["First document", "Second document", "Third document"]);
// Returns number[][]

// Streaming response
const stream = await ai.stream("Write a poem about clouds", "@cf/meta/llama-3.1-8b-instruct");
return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
});

// Image to text (OCR)
const imageData = await ctx.request.arrayBuffer();
const text = await ai.imageToText(imageData, "@cf/meta/llama-3.2-11b-vision-instruct");
```

### createSSE + Streaming

Server-Sent Events and streaming responses.

```typescript
import { createSSE, streamJSON, createStreamResponse } from "cloudflare-kit";

// SSE endpoint
app.get("/events", async (ctx) => {
    const sse = createSSE();

    // Send events
    const interval = setInterval(() => {
        sse.send({
            event: "tick",
            data: { time: new Date().toISOString() },
            id: crypto.randomUUID(),
        });
    }, 1000);

    // Clean up on close
    ctx.request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        sse.close();
    });

    return sse.response;
});

// JSON streaming (NDJSON)
app.get("/large-dataset", async (ctx) => {
    const stream = new ReadableStream({
        async start(controller) {
            for (let i = 0; i < 10000; i++) {
                const row = await fetchRow(i);
                controller.enqueue(JSON.stringify(row) + "\n");
            }
            controller.close();
        },
    });
    return streamJSON(stream);
});

// Custom stream writer
app.get("/logs", async (ctx) => {
    return createStreamResponse(async (writer) => {
        writer.write("Starting process...\n");
        await sleep(1000);
        writer.write("Step 1 complete\n");
        await sleep(1000);
        writer.writeJSON({ status: "done", progress: 100 });
        writer.close();
    });
});
```

### createOpenAPI

Auto-generated OpenAPI specification with Swagger UI.

```typescript
import { createOpenAPI, defineRoute } from "cloudflare-kit";

const openapi = createOpenAPI({
    title: "My API",
    version: "1.0.0",
    description: "REST API for My Application",
    servers: [{ url: "https://api.example.com" }],
});

// Attach to app
app.openapi = openapi;

// Define routes with metadata
app.get(
    "/api/users",
    defineRoute({
        summary: "List users",
        description: "Returns a paginated list of all users",
        tags: ["Users"],
        parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
            "200": {
                description: "List of users",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                users: { type: "array", items: { $ref: "#/components/schemas/User" } },
                                total: { type: "integer" },
                            },
                        },
                    },
                },
            },
        },
    }),
    async (ctx) => {
        const page = parseInt(ctx.query.page as string) || 1;
        const limit = parseInt(ctx.query.limit as string) || 20;
        return jsonResponse(await listUsers(page, limit));
    },
);

// Serve OpenAPI spec and Swagger UI
app.use(openapi.serve("/docs"));
// GET /docs - Swagger UI
// GET /openapi.json - Raw spec
```

### Testing Utilities

Mock bindings and test helpers for unit testing.

```typescript
import { createTestApp, mockRequest, mockEnv, createMockKV, createMockD1 } from "cloudflare-kit/testing";

// Setup
const env = mockEnv({
    JWT_SECRET: "test-secret-32-characters-long!!",
});
const app = createApp();
const testApp = createTestApp(app);

// Write tests
const response = await testApp.post("/api/users", {
    json: { name: "John", email: "john@example.com" },
});

expect(response.status).toBe(201);
expect(await response.json()).toEqual({
    id: 1,
    name: "John",
    email: "john@example.com",
});

// Mock individual services
const kv = createMockKV();
await kv.put("key", "value");
expect(await kv.get("key")).toBe("value");
expect(kv._calls).toEqual([{ method: "put", args: ["key", "value"] }]);

// Mock D1 with data
const db = createMockD1();
db._insert("users", { id: 1, email: "test@example.com" });
const user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(1).first();
expect(user).toEqual({ id: 1, email: "test@example.com" });
```

### Plugin System

Extensible plugin architecture with hooks.

```typescript
import { definePlugin, createPlugin, composePlugins, PluginRegistry } from "cloudflare-kit";

// Define a plugin
const authPlugin = definePlugin({
    name: "auth",
    version: "1.0.0",
    async setup(api) {
        api.onRequest(async (ctx, next) => {
            // Add auth context
            ctx.auth = await verifyAuth(ctx.request);
            return next();
        });

        api.onError(async (error, ctx) => {
            if (error.name === "AuthError") {
                return errorResponse("Unauthorized", 401);
            }
        });
    },
});

// Create plugin with options
const rateLimitPlugin = createPlugin({
    name: "rate-limit",
    setup(api, options: { maxRequests: number }) {
        api.onRequest(async (ctx, next) => {
            if (await isRateLimited(ctx.request, options.maxRequests)) {
                return errorResponse("Rate limited", 429);
            }
            return next();
        });
    },
});

// Compose multiple plugins
const combined = composePlugins([authPlugin, rateLimitPlugin({ maxRequests: 100 })]);

// Use with app
app.use(combined);

// Global registry
const registry = new PluginRegistry();
registry.register(authPlugin);
registry.applyTo(app);
```

### Error Handling

Typed error classes with automatic HTTP status codes.

```typescript
import {
    HttpError,
    ValidationError,
    AuthError,
    RateLimitError,
    DatabaseError,
    CacheError,
    handleError,
} from "cloudflare-kit";

// Throw typed errors
if (!user) throw new AuthError("Invalid credentials", 401);
if (!isValid(data)) throw new ValidationError("Invalid input", [{ field: "email", message: "Invalid format" }]);
if (await isRateLimited(req)) throw new RateLimitError("Too many requests", 429);

// Handle errors globally
const app = createApp({
    onError: (error, request) => {
        // Log all errors
        console.error(`[${request.method}] ${request.url}:`, error);

        // Return appropriate response
        return handleError(error, {
            includeStack: process.env.NODE_ENV === "development",
        });
    },
});

// Custom error response
app.get("/api/data", async (ctx) => {
    try {
        return await fetchData();
    } catch (error) {
        if (error instanceof DatabaseError) {
            return errorResponse("Database unavailable", 503);
        }
        throw error; // Let global handler deal with it
    }
});
```

### Response Helpers

Convenience functions for common response types.

```typescript
import { jsonResponse, errorResponse, successResponse, redirectResponse } from "cloudflare-kit";

// JSON response
return jsonResponse({ id: 1, name: "John" });
return jsonResponse({ created: true }, 201);

// Error response
return errorResponse("Not found", 404);
return errorResponse("Validation failed", 422, { errors: validationErrors });

// Success response (shorthand for common success patterns)
return successResponse({ data: result });
return successResponse({ deleted: true }, { status: 204 });

// Redirect
return redirectResponse("/new-path");
return redirectResponse("https://example.com", 302);

// With custom headers
return jsonResponse(data, 200, {
    "Cache-Control": "max-age=3600",
    "X-Request-ID": crypto.randomUUID(),
});
```

### Middleware

Built-in middleware for common use cases.

```typescript
import { corsMiddleware, jsonMiddleware, securityHeadersMiddleware, requireAuth } from "cloudflare-kit";

// CORS
app.use(
    corsMiddleware({
        origin: ["https://app.example.com", "https://admin.example.com"],
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
        maxAge: 86400,
    }),
);

// JSON body parsing
app.use(
    jsonMiddleware({
        maxSize: "1mb",
        strict: true, // Only accept application/json
    }),
);

// Security headers
app.use(
    securityHeadersMiddleware({
        contentSecurityPolicy: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
        },
        strictTransportSecurity: "max-age=63072000; includeSubDomains",
        xFrameOptions: "DENY",
        xContentTypeOptions: "nosniff",
    }),
);

// Custom middleware
app.use(async (ctx, next) => {
    const start = Date.now();
    const response = await next();
    const duration = Date.now() - start;
    response.headers.set("X-Response-Time", `${duration}ms`);
    return response;
});
```

---

## Full Example: REST API with Auth

A complete production-ready worker with authentication, database, caching, and error handling.

```typescript
// worker.ts
import {
    createApp,
    createAuth,
    createDatabase,
    createCache,
    createLogger,
    rateLimit,
    corsMiddleware,
    jsonMiddleware,
    securityHeadersMiddleware,
    requireAuth,
    v,
    createValidator,
    jsonResponse,
    errorResponse,
    successResponse,
    ValidationError,
    AuthError,
} from "cloudflare-kit";

export interface Env {
    JWT_SECRET: string;
    DB: D1Database;
    CACHE: KVNamespace;
    RATE_LIMIT_KV: KVNamespace;
}

// Initialize services
const app = createApp<Env>({
    onError: (error, request) => {
        console.error(`[${request.method}] ${request.url}:`, error);

        if (error instanceof ValidationError) {
            return errorResponse("Validation failed", 422, { errors: error.details });
        }
        if (error instanceof AuthError) {
            return errorResponse("Unauthorized", 401);
        }

        return errorResponse("Internal server error", 500);
    },
});

const logger = createLogger({ level: "info" });
const auth = createAuth({ secret: (env) => env.JWT_SECRET });
const db = createDatabase({ binding: (env) => env.DB });
const cache = createCache({ binding: (env) => env.CACHE });

// Global middleware
app.use(corsMiddleware({ origin: ["https://app.example.com"] }));
app.use(jsonMiddleware());
app.use(securityHeadersMiddleware());
app.use(logger.requestLogger());

// Rate limiting for auth endpoints
app.use(
    "/auth/*",
    rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 5,
    }),
);

// Validation schemas
const loginSchema = v.object({
    email: v.email(),
    password: v.string().minLength(8),
});

const createUserSchema = v.object({
    name: v.string().minLength(2).maxLength(100),
    email: v.email(),
    password: v.string().minLength(8),
});

// Auth routes
app.post("/auth/login", createValidator(loginSchema), async (ctx) => {
    const { email, password } = ctx.body as { email: string; password: string };

    const user = await db.get<{ id: string; email: string; password_hash: string }>(
        "SELECT * FROM users WHERE email = ?",
        [email],
    );

    if (!user || !(await verifyPassword(password, user.password_hash))) {
        throw new AuthError("Invalid credentials");
    }

    const token = await auth.createToken({
        sub: user.id,
        email: user.email,
        role: "user",
    });

    return jsonResponse({ token, user: { id: user.id, email: user.email } });
});

app.post("/auth/register", createValidator(createUserSchema), async (ctx) => {
    const { name, email, password } = ctx.body as { name: string; email: string; password: string };

    // Check if email exists
    const existing = await db.get("SELECT id FROM users WHERE email = ?", [email]);
    if (existing) {
        throw new ValidationError("Email already registered", [{ field: "email", message: "Email in use" }]);
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const result = await db.execute("INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)", [
        name,
        email,
        passwordHash,
        new Date().toISOString(),
    ]);

    const token = await auth.createToken({
        sub: String(result.meta.last_row_id),
        email,
        role: "user",
    });

    return jsonResponse(
        {
            token,
            user: { id: result.meta.last_row_id, name, email },
        },
        201,
    );
});

// Protected user API
app.get("/api/me", requireAuth(auth), async (ctx) => {
    const cacheKey = `user:${ctx.user.sub}`;

    const user = await cache.getOrSet(
        cacheKey,
        async () => {
            return db.get("SELECT id, name, email, created_at FROM users WHERE id = ?", [ctx.user.sub]);
        },
        300,
    );

    if (!user) throw new AuthError("User not found");
    return jsonResponse(user);
});

// CRUD with caching
app.get("/api/posts", async (ctx) => {
    const page = parseInt(ctx.query.page as string) || 1;
    const limit = Math.min(parseInt(ctx.query.limit as string) || 20, 100);
    const cacheKey = `posts:${page}:${limit}`;

    const result = await cache.getOrSet(
        cacheKey,
        async () => {
            const posts = await db.query("SELECT * FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?", [
                limit,
                (page - 1) * limit,
            ]);
            const { count } = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM posts");
            return { posts, total: count, page, limit };
        },
        60,
    );

    return jsonResponse(result);
});

app.get("/api/posts/:id", async (ctx) => {
    const cacheKey = `post:${ctx.params.id}`;

    const post = await cache.getOrSet(cacheKey, () => db.get("SELECT * FROM posts WHERE id = ?", [ctx.params.id]), 300);

    if (!post) return errorResponse("Post not found", 404);
    return jsonResponse(post);
});

app.post("/api/posts", requireAuth(auth), async (ctx) => {
    const { title, content } = ctx.body as { title: string; content: string };

    const result = await db.execute("INSERT INTO posts (title, content, author_id, created_at) VALUES (?, ?, ?, ?)", [
        title,
        content,
        ctx.user.sub,
        new Date().toISOString(),
    ]);

    // Invalidate list cache
    await cache.invalidateByTag("posts");

    return jsonResponse(
        {
            id: result.meta.last_row_id,
            title,
            content,
            author_id: ctx.user.sub,
        },
        201,
    );
});

app.delete("/api/posts/:id", requireAuth(auth), async (ctx) => {
    const post = await db.get<{ author_id: string }>("SELECT author_id FROM posts WHERE id = ?", [ctx.params.id]);

    if (!post) return errorResponse("Post not found", 404);
    if (post.author_id !== ctx.user.sub) throw new AuthError("Not authorized");

    await db.execute("DELETE FROM posts WHERE id = ?", [ctx.params.id]);
    await cache.delete(`post:${ctx.params.id}`);
    await cache.invalidateByTag("posts");

    return successResponse(null, { status: 204 });
});

export default app;

// Helper functions (in a separate utils file in production)
async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return (await hashPassword(password)) === hash;
}
```

---

## wrangler.toml Reference

```toml
name = "my-worker"
main = "src/worker.ts"
compatibility_date = "2026-01-01"

# Environment variables
[vars]
JWT_SECRET = "change-me-to-32-char-secret-in-production"
GOOGLE_CLIENT_ID = "your-google-client-id"

# Secrets (set via: wrangler secret put <name>)
# - GOOGLE_CLIENT_SECRET
# - DISCORD_CLIENT_SECRET

# D1 Database - used by createDatabase()
[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "your-database-id"

# KV Namespace - used by createCache(), rate limiting
[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-id"
name = "cache"

[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "your-kv-id-2"
name = "rate-limits"

# R2 Bucket - used by createStorage()
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "my-bucket"

# Queue - used by createQueue()
[[queues.producers]]
binding = "QUEUE"
queue = "my-queue"

[[queues.consumers]]
queue = "my-queue"
max_batch_size = 10
max_batch_timeout = 30

# Analytics Engine - used by createAnalytics()
[[analytics_engine_datasets]]
binding = "ANALYTICS"
dataset = "api_metrics"

# Email - used by createMailer()
[[email_bind]]
name = "EMAIL"
destination_address = "notifications@example.com"

# Workers AI - used by createAI()
[ai]
binding = "AI"

# Durable Objects - used by createDurableWebSocket()
[[durable_objects.bindings]]
name = "CHAT_ROOMS"
class_name = "ChatRoom"

[[migrations]]
tag = "v1"
new_classes = ["ChatRoom"]
```

---

## TypeScript Support

cloudflare-kit is written entirely in TypeScript with zero `any` types. Every function is fully typed, and inference works out of the box.

```typescript
import type {
    // Core types
    App,
    RouterContext,
    Middleware,
    RequestContext,
    Handler,

    // Service types
    AuthService,
    DatabaseService,
    CacheService,
    StorageService,
    QueueService,
    Logger,

    // Utility types
    ValidationResult,
    RateLimitResult,
    OAuthResult,
    EmailResult,

    // Error types
    HttpError,
    ValidationError,
    AuthError,
} from "cloudflare-kit";

// Type your environment
interface Env {
    JWT_SECRET: string;
    DB: D1Database;
    CACHE: KVNamespace;
    BUCKET: R2Bucket;
}

// Full type safety
const app = createApp<Env>();
app.get("/api/data", async (ctx) => {
    // ctx.env is typed as Env
    // ctx.params, ctx.query are Record<string, string>
    // ctx.user is typed when using requireAuth
    return jsonResponse({ data: true });
});
```

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/bhuvaneshcj/cloudflare-kit.git
cd cloudflare-kit
npm install
npm run build
```

Run tests: `npm test`
Run lint: `npm run lint`

## License

MIT © 2026 Bhuvanesh C
