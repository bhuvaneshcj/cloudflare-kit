# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Throws `ConfigurationError` if secret is too short

#### OAuth PKCE Implementation

- **CRITICAL FIX**: Added PKCE (Proof Key for Code Exchange) to OAuth flow
- `getAuthUrl()` now returns both `url` and `codeVerifier`
- `handleCallback()` requires `codeVerifier` parameter
- Prevents authorization code interception attacks
- New helper functions: `generateCodeVerifier()`, `generateCodeChallenge()`

#### Rate Limiter Race Condition Fix

- Added mutex-like locking using KV metadata to prevent race conditions
- `acquireLock()` and `releaseLock()` functions ensure atomic updates
- Prevents concurrent requests from bypassing rate limits
- Lock automatically expires after 10 seconds to prevent deadlocks

#### Cache Tag Race Condition Fix

- Added locking mechanism for cache tag operations
- `invalidateByTag()` now uses atomic locks to prevent race conditions
- Prevents cache corruption during concurrent tag invalidations

#### WebSocket Connection Limits

- Added `maxConnections` option to `createWebSocketHandler()` (default: 100)
- Tracks active connections per handler instance
- Returns HTTP 503 when limit is exceeded
- Automatic cleanup on close/error events

#### Stack Trace Leak Fix

- Error handler no longer exposes `error.message` in production
- Returns generic "Internal Server Error" to prevent information disclosure
- Maintains detailed logging for debugging

### Performance Improvements

#### Router Optimization

- Route cache with 1000-entry LRU for O(1) repeated lookups
- Pre-compiled regex patterns for parameter extraction
- Wildcard and exact-match route prioritization
- ~50-70% faster route matching for frequently accessed paths

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
- Rate limiter now uses atomic locking (internal implementation change)
- Cache tag operations now use locking (internal implementation change)

### Migration Guide

#### OAuth Changes (Breaking)

```typescript
// Before
const url = await oauth.getAuthUrl(state);
const result = await oauth.handleCallback(code, state);

// After
const { url, codeVerifier } = await oauth.getAuthUrl(state);
const result = await oauth.handleCallback(code, state, codeVerifier);
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
