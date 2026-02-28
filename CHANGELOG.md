# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/bhuvaneshcj/cloudflare-kit/releases/tag/v1.0.0
