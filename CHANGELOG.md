# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0] - 2026-07-20

Aligned with the latest Cloudflare Workers stack (workers-types **v5**, Wrangler **4**).

### Breaking

- Peer / CLI scaffold: `@cloudflare/workers-types` **^5** (was ^4)
- Package / CLI dependency → `4.0.0`
- Removed hand-rolled ambient Workers globals; use `@cloudflare/workers-types` or `wrangler types`
- D1 types re-exported from workers-types (binding is `prepare`/`batch`/`exec`/`withSession` — no fake `query`/`execute`)
- Durable Object WebSocket helpers use official `DurableObjectState` / `DurableObjectStorage`
- Email: prefer Cloudflare Email Service `send_email` + `EmailMessageBuilder`; kit `EmailMessage` is now an alias of that builder (not the MIME envelope type)
- CLI scaffolds `wrangler.jsonc`, `compatibility_date = "2026-07-20"`, `nodejs_compat`, Wrangler **^4**

### Added / improved

- Official D1 session types (`D1DatabaseSession`, bookmarks, constraints)
- Email exports: `EmailMessageBuilder`, `EmailSendResult`, official `SendEmail`
- CLI `npm run types` → `wrangler types` for Env generation

## [3.0.0] - 2026-07-20

Major quality release: deepen existing APIs (no new product modules). Some behaviors are intentionally stricter.

### Breaking

- Package version / CLI scaffold dependency → `3.0.0`
- CLI entry is `cli/index.cjs` (fixes ESM `"type": "module"` bin breakage)
- `createValidator` query coercion is **opt-in** (`coerceQuery: true`); query values stay strings by default
- Cache failures throw `CacheError` instead of failing silently
- Queue consumer processors receive `QueueMessage<T>` (`id`, `body`, `timestamp`, `attempts`) not bare body
- Email `send` / `sendTemplate` throw on failure (MailChannels path warns as deprecated)
- Database `where` still accepts plain equality maps; richer `{ op, value }` conditions supported

### Added / improved

- `createApp<Env>()` typed env; `trailingSlash: "ignore" | "redirect"`
- Query params: duplicate keys become `string[]`
- Response helpers: optional headers; `errorResponse` details; `successResponse` data objects
- CORS: origin arrays/callbacks, `maxAge`, `exposeHeaders`, credential-safe origin reflection
- `jsonMiddleware({ maxSize })`; skips re-parse when `state.body` set
- Validation: `regex`, `enum`, `nullable`, `default`
- Auth: `clockSkewSeconds`; `requireAuth` optional cookie / session mode
- OpenAPI `attach()` forwards **all** middleware + handlers
- Rate-limit middleware sets `X-RateLimit-*` on success
- Queue: `sendOrThrow`, batch delay options, richer consumer metadata
- WebSocket: `asHandler()` for `app.get('/ws', asHandler(ws))`
- Plugins: real providers map; `composePlugins` merges hooks
- Streaming writers awaitable; storage errors re-exported from root
- Example worker: `examples/worker.ts`
- Expanded Vitest coverage for 3.0 behaviors

### Fixed

- OpenAPI multi-middleware regression
- CLI bin under ESM package type

## [2.2.0] - 2026-07-20

### Fixed (critical)

- **Router**: path params (`:id`) and wildcard splat (`params["*"]`) now match correctly
- **Validation**: `minLength` / `email` / `url` / `min` / `max` chaining actually enforces rules
- **Auth**: added `requireAuth`; multi-middleware route registration (`app.post(path, mw, handler)`)
- **Storage**: HMAC-signed upload tokens (requires `signingSecret`); forgeable SHA-256 stubs removed
- **securityHeadersMiddleware**: now sets real security headers on responses
- **JWT**: UTF-8-safe encoding; reject tokens without `exp`; optional `issuer` / `audience`
- **Database**: `update`/`delete` take structured `where` objects (no raw SQL injection); failures throw `DatabaseError`
- **OAuth**: `handleCallback(code, codeVerifier, state, expectedState)` validates CSRF state when expected is provided
- **WebSocket Durable helper**: hibernation-safe API (`webSocketMessage` / `webSocketClose` forwarding)
- **Testing**: absolute URLs in `mockRequest`; `createTestApp` body reuse fixed

### Added

- `requireAuth`, `createRateLimitMiddleware`, `verifySignedUploadToken`, `logger.requestLogger()`
- `AppOptions.plugins` / `onError` wired into `createApp`
- `cloudflare-kit/testing` subpath export and CLI `bin`
- Vitest test suite (`npm test`)

### Changed

- Version banner / package version → `2.2.0`
- In-memory rate limiter capped + returns `Retry-After` / rate-limit headers
- KV rate store documents best-effort (not strongly atomic); Durable Objects required for exact limits
- Email templates HTML-escape interpolation; send failures throw
- AI helpers throw on failure; model id passed to `binding.run` (not gateway URL)

### Corrected documentation (honesty)

Earlier 2.1.0 notes incorrectly claimed KV mutex locks, cache-tag locks, and an LRU route cache.
Those were never implemented. This release documents real behavior instead.

## [2.1.0] - 2026-03-01

### Security Fixes (CRITICAL)

#### JWT Algorithm Validation

- **CRITICAL FIX**: Added strict JWT algorithm validation to prevent `alg=none` attacks
- Header `alg` is now validated to be exactly `HS256`
- Header `typ` is now validated to be exactly `JWT`
- Any deviation results in immediate verification failure

#### JWT Secret Length Enforcement

- Added minimum secret length validation (32 characters)
- Prevents weak secrets that could be brute-forced
- Throws `ConfigError` if secret is too short

#### OAuth PKCE Implementation

- **CRITICAL FIX**: Added PKCE (Proof Key for Code Exchange) to OAuth flow
- `getAuthUrl()` now returns both `url` and `codeVerifier`
- `handleCallback()` requires `codeVerifier` parameter
- Prevents authorization code interception attacks
- New helper functions: `generateCodeVerifier()`, `generateCodeChallenge()`

#### WebSocket Connection Limits

- Added `maxConnections` option to `createWebSocketHandler()` (default: 100)
- Tracks active connections per handler instance
- Returns HTTP 503 when limit is exceeded
- Automatic cleanup on close/error events

#### Stack Trace Leak Fix

- Error handler no longer exposes `error.message` in production
- Returns generic "Internal Server Error" to prevent information disclosure
- Maintains detailed logging for debugging

### Note on retracted 2.1.0 claims

The following items were listed in earlier 2.1.0 changelog text but were **not** present in the published code: KV rate-limit mutex, cache-tag locks, and LRU route cache. See 2.2.0 for accurate behavior.

### New Features

#### Testing Utilities

- `createTestApp()` - Wraps apps for easy testing with convenience methods
- `mockRequest()` - Creates mock Request objects
- `mockEnv()` - Creates complete mock environment with KV, D1, R2, Queue
- `createMockKV()` - In-memory KV implementation
- `createMockD1()` - In-memory D1 database mock
- `createMockR2()` - In-memory R2 bucket mock
- `createMockExecutionContext()` - Mock execution context
- `expectJSON()` / `expectStatus()` - Test assertion helpers

### Changed

- `OAuthClient.getAuthUrl()` now returns `Promise<AuthUrlResult>` instead of `string`
- `AuthUrlResult` includes both `url` and `codeVerifier`
- `OAuthClient.handleCallback()` now requires `codeVerifier` parameter

### Migration Guide

#### OAuth Changes (Breaking)

```typescript
// Before
const url = await oauth.getAuthUrl(state);
const result = await oauth.handleCallback(code, state);

// After
const { url, codeVerifier, state: oauthState } = await oauth.getAuthUrl(state);
const result = await oauth.handleCallback(code, codeVerifier, callbackState, oauthState);
```

Store the `codeVerifier` in your session and pass it to `handleCallback()` when the user returns.

## [2.0.0] - 2026-02-28

### Added

#### Enterprise Storage Module

- **Streaming Uploads**: Memory-efficient uploads for files <100MB via `uploadStream()`
- **Multipart Uploads**: Large file support >100MB with progress tracking via `uploadMultipart()`
- **Auto-Detection**: `uploadFromRequest()` automatically chooses optimal strategy
- **Signed URLs**: Secure token-based upload URLs with expiration
- **Range Downloads**: Partial content support for video streaming
- **Batch Operations**: `deleteMany()` for efficient bulk deletes
- **File Validation**: MIME type, extension, size, and custom validators

#### Storage Error Handling

- `FileTooLargeError` - Size limit exceeded with readable message
- `InvalidMimeTypeError` - MIME type validation failure
- `InvalidFileExtensionError` - File extension validation
- `UploadFailedError` - Upload operation failures
- `DownloadFailedError` - Download operation failures
- `FileNotFoundError` - Missing file errors
- `MultipartUploadError` - Multipart-specific errors
- `SignedUrlError` - URL generation failures
- `StorageValidationError` - General validation errors

#### Storage Utilities

- `validateFile()` - Comprehensive file validation
- `parseContentType()` - Content-Type header parsing
- `formatBytes()` - Human-readable byte formatting
- `shouldUseMultipart()` - Strategy detection
- `calculatePartSize()` - Optimal part size calculation

### Changed

- **Storage Service**: Complete rewrite with enterprise-grade architecture
- **Type Safety**: Full TypeScript coverage for all storage operations
- **Backward Compatibility**: `StorageOptions` alias and `createStorageLegacy()` function

### Removed

- Legacy simple storage API (replaced with comprehensive enterprise API)

## [1.0.0] - 2026-02-28

### Added

#### Core Framework

- `createApp()` - Application builder with middleware support
- HTTP routing (GET, POST, PUT, DELETE, PATCH)
- Response helpers: `jsonResponse()`, `errorResponse()`, `successResponse()`, `redirectResponse()`
- Built-in middleware: CORS, JSON parsing, security headers

#### Enterprise Error System

- `CloudflareKitError` - Base error class with codes and status
- `HttpError` - HTTP errors with static factories (badRequest, unauthorized, notFound, etc.)
- `ValidationError` - Input validation with field-level errors
- `AuthError` - Authentication errors (invalidToken, missingToken, etc.)
- `RateLimitError` - Rate limiting with Retry-After headers
- `DatabaseError`, `CacheError`, `ConfigError`, `PluginError` - Service errors
- `handleError()` - Global error handler

#### Plugin System

- `definePlugin()` - Type-safe plugin definition
- `PluginRegistry` - Plugin management with dependency resolution
- 7 lifecycle hooks: app:init, app:shutdown, request:start, request:end, request:error, route:register, middleware:register
- Plugin composition with `composePlugins()`

#### Rate Limiting

- `createRateLimiter()` - Pluggable rate limiter
- `createMemoryRateLimitStore()` - In-memory store for development
- `createKVRateLimitStore()` - KV-backed store for production
- `RateLimitStore` interface for custom backends
- Rate limit middleware with standard headers

#### Cloudflare Services

- **Auth**: JWT and session-based authentication
- **Database**: D1 database wrapper with query helpers
- **Cache**: KV namespace caching with TTL support
- **Storage**: R2 object storage operations
- **Queue**: Message queue handling with consumers
- **Logging**: Structured logging with levels

#### Build & Distribution

- ESM and CJS dual publishing
- TypeScript definitions
- Tree-shakeable exports
- 20KB bundle size

[2.0.0]: https://github.com/bhuvaneshcj/cloudflare-kit/releases/tag/v2.0.0
[1.0.0]: https://github.com/bhuvaneshcj/cloudflare-kit/releases/tag/v1.0.0
