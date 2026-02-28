# Cloudflare Kit

The all-in-one toolkit for building Cloudflare Workers with simple, clear, beginner-friendly APIs.

[![npm version](https://img.shields.io/npm/v/cloudflare-kit.svg)](https://www.npmjs.com/package/cloudflare-kit)
[![npm downloads](https://img.shields.io/npm/dm/cloudflare-kit.svg)](https://www.npmjs.com/package/cloudflare-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Bundle Size](https://img.shields.io/bundlephobia/min/cloudflare-kit)](https://bundlephobia.com/package/cloudflare-kit)

> **Latest:** v2.0.0 - Enterprise Storage with streaming, multipart uploads, and signed URLs

## Features

- **App Framework** - Minimalist routing with middleware support
- **Authentication** - JWT and session-based authentication
- **Database** - Type-safe D1 database wrapper
- **Caching** - KV namespace caching utilities
- **Storage** - R2 object storage operations
- **Queues** - Message queue handling with consumers
- **Logging** - Structured logging with levels
- **Security** - Rate limiting and request validation
- **Plugin System** - Extensible architecture with lifecycle hooks
- **Structured Errors** - Enterprise error handling with codes
- **Distributed Rate Limiting** - Production-ready with KV support

## Installation

```bash
npm install cloudflare-kit
```

## Quick Start

```typescript
import { createApp, jsonResponse, corsMiddleware } from "cloudflare-kit";

const app = createApp();

app.use(corsMiddleware());

app.get("/", () => {
    return jsonResponse({ message: "Hello, World!" });
});

app.get("/users", () => {
    return jsonResponse({ users: [] });
});

export default app;
```

## Enterprise Features (New in v2.0)

### 🚀 Enterprise Storage

Enterprise-grade R2 storage with streaming uploads, multipart support, and signed URLs:

```typescript
import { createStorage } from "cloudflare-kit";

const storage = createStorage({
  binding: env.STORAGE,
  maxFileSize: 100 * 1024 * 1024, // 100MB
  allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"]
});

// Streaming upload (files <100MB)
await storage.uploadStream("file.pdf", request.body, {
  contentType: "application/pdf"
});

// Multipart upload (files >100MB) with progress
await storage.uploadMultipart("large.zip", stream, fileSize, {
  onProgress: (p) => console.log(`${p.percentage}% uploaded`)
});

// Auto-detect strategy
await storage.uploadFromRequest(request, "file.pdf");

// Create signed URL for secure uploads
const signedUrl = await storage.createSignedUploadUrl("file.pdf", {
  expiration: 3600 // 1 hour
});
```

### 🔒 Enterprise Error System

Structured error handling with codes and automatic HTTP responses:

```typescript
import { HttpError, ValidationError, handleError } from "cloudflare-kit";

// Throw semantic errors
throw HttpError.notFound("User not found");
throw ValidationError.field("email", "Invalid email format");
throw new RateLimitError("Too many requests", 60);

// Global error handling
app.use(async (c, next) => {
  try {
    await next();
  } catch (error) {
    return handleError(error);
  }
});
```

### 🔌 Plugin System

Extensible architecture with lifecycle hooks:

```typescript
import { definePlugin } from "cloudflare-kit";

const metricsPlugin = definePlugin({
  name: "metrics",
  version: "1.0.0",
  hooks: {
    "request:start": async (context) => {
      context.set("startTime", Date.now());
    },
    "request:end": async (context) => {
      const duration = Date.now() - context.get("startTime");
      console.log(`Request took ${duration}ms`);
    }
  }
});

app.use(registerPlugin(metricsPlugin));
```

### ⚡ Distributed Rate Limiting

Production-ready rate limiting with KV or Memory stores:

```typescript
import { createRateLimiter, createKVRateLimitStore } from "cloudflare-kit";

const rateLimiter = createRateLimiter({
  store: createKVRateLimitStore(env.RATE_LIMIT_KV),
  maxRequests: 100,
  windowMs: 60000 // 1 minute
});

app.use(rateLimit({ limiter: rateLimiter }));
```

## What's New in v2.0

### Added
- **Enterprise Storage Module**: Streaming uploads, multipart uploads, signed URLs
- **Storage Error Classes**: 9 specialized error types for storage operations
- **File Validation**: MIME type, extension, and custom validators
- **Progress Tracking**: Real-time upload progress for multipart uploads
- **Range Downloads**: Partial content support for video streaming
- **Batch Operations**: Efficient bulk delete operations

### Changed
- Complete storage service rewrite with enterprise-grade architecture
- Full TypeScript coverage for all storage operations
- Improved error messages with human-readable formatting

### Migration from v1.x

v2.0 is backward compatible. Existing storage code continues to work:

```typescript
// v1.x style (still works)
const storage = createStorage({ binding: env.STORAGE });

// v2.0 enhanced API
const storage = createStorage({
  binding: env.STORAGE,
  maxFileSize: 100 * 1024 * 1024,
  allowedMimeTypes: ["image/*", "application/pdf"],
  multipart: { partSize: 5 * 1024 * 1024 }
});
```

See [MIGRATION.md](MIGRATION.md) for detailed migration guide.

## Features (from v1.0)

### Plugin System

Extend the framework with custom plugins:

```typescript
import { definePlugin } from "cloudflare-kit";

const tracingPlugin = definePlugin({
    name: "tracing",
    version: "1.0.0",
    hooks: {
        "request:start": (ctx) => {
            ctx.state.traceId = crypto.randomUUID();
        },
    },
});
```

### Structured Error Handling

Rich error classes with HTTP status codes:

```typescript
import { HttpError, ValidationError } from "cloudflare-kit";

throw HttpError.notFound("User not found");
throw HttpError.unauthorized("Invalid token");
throw new ValidationError("Validation failed", "email", [{ field: "email", message: "Invalid format" }]);
```

### Distributed Rate Limiting

Production-ready rate limiting with Cloudflare KV:

```typescript
import { createRateLimiter, createKVRateLimitStore } from "cloudflare-kit";

const limiter = createRateLimiter({
    store: createKVRateLimitStore({ binding: env.RATE_LIMIT_KV }),
    maxRequests: 100,
    windowSeconds: 60,
});
```

## More Examples

### Complete CRUD API

```typescript
import {
    createApp,
    createDatabase,
    createAuth,
    jsonResponse,
    errorResponse,
    corsMiddleware,
    HttpError,
} from "cloudflare-kit";

export interface Env {
    DB: D1Database;
    JWT_SECRET: string;
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const db = createDatabase({ binding: env.DB });
        const auth = createAuth({ jwtSecret: env.JWT_SECRET });

        const app = createApp({ database: db, auth });

        app.use(corsMiddleware());

        // Get all users
        app.get("/api/users", async () => {
            const users = await db.query("SELECT id, email FROM users LIMIT 100");
            return jsonResponse({ users: users.results });
        });

        // Get single user
        app.get("/api/users/:id", async (ctx) => {
            const id = ctx.url.pathname.split("/").pop();
            const user = await db.get("SELECT * FROM users WHERE id = ?", [id]);

            if (!user) {
                throw HttpError.notFound("User not found");
            }

            return jsonResponse({ user });
        });

        // Create user
        app.post("/api/users", async (ctx) => {
            const { email, name } = ctx.state.body;
            const id = crypto.randomUUID();

            await db.insert("users", { id, email, name });

            return jsonResponse({ id, email, name }, 201);
        });

        // Update user
        app.put("/api/users/:id", async (ctx) => {
            const id = ctx.url.pathname.split("/").pop();
            const { email, name } = ctx.state.body;

            await db.update("users", { email, name }, "id = ?", [id]);

            return jsonResponse({ id, email, name });
        });

        // Delete user
        app.delete("/api/users/:id", async (ctx) => {
            const id = ctx.url.pathname.split("/").pop();
            await db.delete("users", "id = ?", [id]);

            return jsonResponse({ success: true });
        });

        return app.fetch(request, env, ctx);
    },
};
```

### Authentication Flow

```typescript
import { createAuth, HttpError } from "cloudflare-kit";

const auth = createAuth({ jwtSecret: env.JWT_SECRET });

// Login
app.post("/login", async (ctx) => {
    const { email, password } = ctx.state.body;

    // Verify credentials...
    const user = { id: "123", email };

    const result = await auth.createToken(user);
    if (!result.success) {
        throw HttpError.unauthorized("Invalid credentials");
    }

    return jsonResponse({ token: result.token, user });
});

// Protected route
app.get("/me", async (ctx) => {
    const token = ctx.request.headers.get("Authorization")?.replace("Bearer ", "");
    const result = await auth.verifyToken(token);

    if (!result.success) {
        throw HttpError.unauthorized("Invalid token");
    }

    return jsonResponse({ user: result.user });
});
```

### Caching with KV

```typescript
import { createCache } from "cloudflare-kit";

const cache = createCache({
    binding: env.CACHE,
    defaultTTL: 300, // 5 minutes
});

app.get("/api/data", async () => {
    // Try cache first
    const cached = await cache.get("data:key");
    if (cached) {
        return jsonResponse({ data: cached, cached: true });
    }

    // Fetch from database
    const data = await fetchExpensiveData();

    // Cache for 10 minutes
    await cache.set("data:key", data, 600);

    return jsonResponse({ data, cached: false });
});
```

### File Upload with R2

```typescript
import { createStorage } from "cloudflare-kit";

const storage = createStorage({ binding: env.STORAGE });

app.post("/upload", async (ctx) => {
    const formData = await ctx.request.formData();
    const file = formData.get("file") as File;

    const key = `uploads/${crypto.randomUUID()}-${file.name}`;

    await storage.upload(key, file.stream(), {
        contentType: file.type,
        customMetadata: { uploadedBy: "user-id" },
    });

    return jsonResponse({ key, url: `/download/${key}` }, 201);
});
```

## API Reference

### Core

#### `createApp(options?)`

Creates a new Cloudflare Worker application.

```typescript
import { createApp, createDatabase, createCache } from "cloudflare-kit";

const app = createApp({
    database: createDatabase({ binding: env.DB }),
    cache: createCache({ binding: env.CACHE }),
});
```

**Methods:**

- `use(middleware)` - Add middleware
- `get(path, handler)` - Register GET route
- `post(path, handler)` - Register POST route
- `put(path, handler)` - Register PUT route
- `delete(path, handler)` - Register DELETE route
- `patch(path, handler)` - Register PATCH route
- `fetch(request, env, executionContext)` - Handle requests

#### Response Helpers

```typescript
import { jsonResponse, errorResponse, successResponse, redirectResponse } from 'cloudflare-kit';

jsonResponse(data, status?)     // JSON response (default 200)
errorResponse(message, status?) // Error response (default 500)
successResponse(message)        // Success message
redirectResponse(location, status?) // Redirect (default 302)
```

#### Middleware

```typescript
import { corsMiddleware, jsonMiddleware, securityHeadersMiddleware } from "cloudflare-kit";

// CORS support
app.use(corsMiddleware({ origin: "https://example.com" }));

// Parse JSON body
app.use(jsonMiddleware());

// Security headers
app.use(securityHeadersMiddleware());
```

### Authentication

```typescript
import { createAuth } from "cloudflare-kit";

const auth = createAuth({
    jwtSecret: env.JWT_SECRET,
    sessionDuration: 60 * 60 * 24 * 7, // 7 days
    database: db, // Optional: for session-based auth
});

// Create token
const result = await auth.createToken({ id: "123", email: "user@example.com" });

// Verify token
const user = await auth.verifyToken(request.headers.get("Authorization"));

// Session-based auth
const session = await auth.createSession(user);
const verified = await auth.verifySession(sessionId);
```

### Database (D1)

```typescript
import { createDatabase } from "cloudflare-kit";

const db = createDatabase({ binding: env.DB });

// Query multiple rows
const users = await db.query("SELECT * FROM users WHERE active = ?", [true]);

// Get single row
const user = await db.get("SELECT * FROM users WHERE id = ?", ["123"]);

// Execute write operations
await db.execute("INSERT INTO users (id, email) VALUES (?, ?)", ["123", "user@example.com"]);

// Helper methods
await db.insert("users", { id: "123", email: "user@example.com" });
await db.update("users", { email: "new@example.com" }, "id = ?", ["123"]);
await db.delete("users", "id = ?", ["123"]);
```

### Cache (KV)

```typescript
import { createCache } from "cloudflare-kit";

const cache = createCache({
    binding: env.CACHE,
    defaultTTL: 300, // 5 minutes
});

// Store values
await cache.set("user:123", userData, 600); // 10 minutes
await cache.setString("config:api", "value");

// Retrieve values
const user = await cache.get("user:123");
const config = await cache.getString("config:api");

// Check existence
const exists = await cache.has("user:123");

// Delete
await cache.delete("user:123");

// Get or compute pattern
const data = await cache.getOrSet(
    "expensive:query",
    async () => {
        return await fetchExpensiveData();
    },
    300,
);
```

### Storage (R2)

```typescript
import { createStorage } from "cloudflare-kit";

const storage = createStorage({ binding: env.STORAGE });

// Upload
const result = await storage.upload("documents/file.pdf", fileStream, {
    contentType: "application/pdf",
    customMetadata: { owner: "user123" },
});

// Download
const file = await storage.download("documents/file.pdf");
if (file.success) {
    return new Response(file.data);
}

// Metadata
const meta = await storage.getMetadata("documents/file.pdf");

// Delete
await storage.delete("documents/file.pdf");
await storage.deleteMultiple(["file1.pdf", "file2.pdf"]);

// List files
const files = await storage.list("documents/");
```

### Queue

```typescript
import { createQueue, createQueueConsumer } from "cloudflare-kit";

const queue = createQueue({ binding: env.MY_QUEUE });

// Send message
await queue.send({ type: "send-email", to: "user@example.com" });

// Send with delay
await queue.send({ type: "reminder" }, { delaySeconds: 3600 });

// Send batch
await queue.sendBatch([
    { type: "email", to: "user1@example.com" },
    { type: "email", to: "user2@example.com" },
]);

// Consumer
export default {
    async fetch(request, env, ctx) {
        /* ... */
    },

    async queue(batch, env, ctx) {
        const handler = createQueueConsumer(async (message) => {
            console.log("Processing:", message);
        });
        await handler(batch, env, ctx);
    },
};
```

### Logging

```typescript
import { createLogger } from "cloudflare-kit";

const logger = createLogger({
    level: "info", // 'debug' | 'info' | 'warn' | 'error'
    service: "my-api",
    environment: "production",
});

logger.debug("Debug info", { userId: "123" });
logger.info("User logged in", { userId: "123" });
logger.warn("Rate limit approaching");
logger.error("Database error", { error: err.message });

// Child logger with context
const requestLogger = logger.child({ requestId: "abc-123" });
requestLogger.info("Request started"); // Includes requestId
```

### Security

```typescript
import { rateLimit, validateRequest } from "cloudflare-kit";

// Rate limiting
app.use(
    rateLimit({
        maxRequests: 100,
        windowSeconds: 60,
        keyGenerator: (request) => request.headers.get("CF-Connecting-IP") || "unknown",
    }),
);

// Request validation
app.post(
    "/register",
    validateRequest({
        email: { type: "email", required: true },
        password: { type: "string", required: true, minLength: 8 },
    }),
    async (context) => {
        // Request body is validated
        const { email, password } = context.state.body;
    },
);
```

## Complete Example

```typescript
import {
    createApp,
    createAuth,
    createDatabase,
    createCache,
    createLogger,
    jsonResponse,
    errorResponse,
    corsMiddleware,
    jsonMiddleware,
    rateLimit,
    validateRequest,
} from "cloudflare-kit";

export interface Env {
    DB: D1Database;
    CACHE: KVNamespace;
    JWT_SECRET: string;
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const logger = createLogger({ level: "info", service: "my-api" });
        const db = createDatabase({ binding: env.DB });
        const cache = createCache({ binding: env.CACHE, defaultTTL: 300 });
        const auth = createAuth({ jwtSecret: env.JWT_SECRET });

        const app = createApp({ database: db, cache, auth, logger });

        app.use(corsMiddleware());
        app.use(jsonMiddleware());
        app.use(rateLimit({ maxRequests: 100, windowSeconds: 60 }));

        app.get("/health", () => jsonResponse({ status: "ok" }));

        app.post(
            "/login",
            validateRequest({ email: { type: "email", required: true }, password: { type: "string", required: true } }),
            async (context) => {
                const { email } = context.state.body;
                const result = await auth.createToken({ id: crypto.randomUUID(), email });
                if (!result.success) return errorResponse(result.error || "Auth failed", 500);
                return jsonResponse({ token: result.token });
            },
        );

        return app.fetch(request, env, ctx);
    },
};
```

## TypeScript Support

Cloudflare Kit is written in TypeScript and provides full type definitions:

```typescript
import type {
    Middleware,
    RequestContext,
    Handler,
    AuthOptions,
    User,
    DatabaseOptions,
    CacheOptions,
    StorageOptions,
    QueueOptions,
    LoggerOptions,
    RateLimitOptions,
    ValidationSchema,
} from "cloudflare-kit";
```

## Requirements

- Node.js >= 18
- TypeScript >= 5.0 (recommended)
- Cloudflare Workers runtime

## CLI (Optional)

Scaffold a new project:

```bash
npx cloudflare-kit create my-project
cd my-project
npm install
npm run dev
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT © 2026 Bhuvanesh C

## Security

See [SECURITY.md](SECURITY.md) for reporting security issues.
