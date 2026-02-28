/**
 * Cloudflare Kit Error System
 *
 * Structured error handling with operational and programming error distinction.
 */

/**
 * Base error class for all Cloudflare Kit errors
 */
export class CloudflareKitError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly isOperational: boolean;
    readonly timestamp: string;

    constructor(message: string, code: string, statusCode: number = 500, isOperational: boolean = true) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.timestamp = new Date().toISOString();

        // Stack trace is automatically captured in modern environments
        // Note: Error.captureStackTrace is Node.js specific, not available in Workers
        Object.setPrototypeOf(this, new.target.prototype);
    }

    /**
     * Serialize error to JSON format for API responses
     */
    toJSON(): Record<string, unknown> {
        return {
            error: {
                code: this.code,
                message: this.message,
                statusCode: this.statusCode,
                ...((globalThis as { ENVIRONMENT?: string }).ENVIRONMENT === "development" && { stack: this.stack }),
            },
        };
    }

    /**
     * Create a Response object from this error
     */
    toResponse(): Response {
        return new Response(JSON.stringify(this.toJSON()), {
            status: this.statusCode,
            headers: {
                "Content-Type": "application/json",
            },
        });
    }
}

/**
 * HTTP-specific errors with status codes
 */
export class HttpError extends CloudflareKitError {
    constructor(message: string, statusCode: number = 500, code?: string) {
        super(message, code || `HTTP_${statusCode}`, statusCode, true);
    }

    static badRequest(message = "Bad Request"): HttpError {
        return new HttpError(message, 400, "BAD_REQUEST");
    }

    static unauthorized(message = "Unauthorized"): HttpError {
        return new HttpError(message, 401, "UNAUTHORIZED");
    }

    static forbidden(message = "Forbidden"): HttpError {
        return new HttpError(message, 403, "FORBIDDEN");
    }

    static notFound(message = "Not Found"): HttpError {
        return new HttpError(message, 404, "NOT_FOUND");
    }

    static methodNotAllowed(message = "Method Not Allowed"): HttpError {
        return new HttpError(message, 405, "METHOD_NOT_ALLOWED");
    }

    static conflict(message = "Conflict"): HttpError {
        return new HttpError(message, 409, "CONFLICT");
    }

    static unprocessable(message = "Unprocessable Entity"): HttpError {
        return new HttpError(message, 422, "UNPROCESSABLE_ENTITY");
    }

    static tooManyRequests(message = "Too Many Requests", retryAfter?: number): RateLimitError {
        return new RateLimitError(message, retryAfter);
    }

    static internal(message = "Internal Server Error"): HttpError {
        return new HttpError(message, 500, "INTERNAL_ERROR");
    }

    static notImplemented(message = "Not Implemented"): HttpError {
        return new HttpError(message, 501, "NOT_IMPLEMENTED");
    }

    static badGateway(message = "Bad Gateway"): HttpError {
        return new HttpError(message, 502, "BAD_GATEWAY");
    }

    static serviceUnavailable(message = "Service Unavailable"): HttpError {
        return new HttpError(message, 503, "SERVICE_UNAVAILABLE");
    }
}

/**
 * Validation errors for input validation failures
 */
export class ValidationError extends CloudflareKitError {
    readonly field?: string;
    readonly errors: Array<{ field: string; message: string; code?: string }>;

    constructor(
        message: string,
        field?: string,
        errors: Array<{ field: string; message: string; code?: string }> = [],
    ) {
        super(message, "VALIDATION_ERROR", 400, true);
        this.field = field;
        this.errors = errors;
    }

    override toJSON(): Record<string, unknown> {
        return {
            error: {
                code: this.code,
                message: this.message,
                statusCode: this.statusCode,
                ...(this.field && { field: this.field }),
                ...(this.errors.length > 0 && { errors: this.errors }),
            },
        };
    }

    static fromZodError(zodError: {
        issues: Array<{ path: (string | number)[]; message: string; code: string }>;
    }): ValidationError {
        const errors = zodError.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
            code: issue.code,
        }));

        return new ValidationError(
            `Validation failed: ${errors.map((e) => `${e.field} - ${e.message}`).join(", ")}`,
            undefined,
            errors,
        );
    }
}

/**
 * Authentication and authorization errors
 */
export class AuthError extends CloudflareKitError {
    constructor(message: string, code: string = "AUTH_ERROR") {
        super(message, code, 401, true);
    }

    static invalidToken(message = "Invalid or expired token"): AuthError {
        return new AuthError(message, "INVALID_TOKEN");
    }

    static missingToken(message = "Authentication required"): AuthError {
        return new AuthError(message, "MISSING_TOKEN");
    }

    static expiredToken(message = "Token has expired"): AuthError {
        return new AuthError(message, "TOKEN_EXPIRED");
    }

    static insufficientPermissions(message = "Insufficient permissions"): AuthError {
        return new AuthError(message, "FORBIDDEN");
    }

    static invalidCredentials(message = "Invalid credentials"): AuthError {
        return new AuthError(message, "INVALID_CREDENTIALS");
    }
}

/**
 * Rate limiting errors with retry information
 */
export class RateLimitError extends CloudflareKitError {
    readonly retryAfter?: number;
    readonly limit?: number;
    readonly remaining?: number;
    readonly resetTime?: number;

    constructor(
        message: string = "Too Many Requests",
        retryAfter?: number,
        limit?: number,
        remaining?: number,
        resetTime?: number,
    ) {
        super(message, "RATE_LIMITED", 429, true);
        this.retryAfter = retryAfter;
        this.limit = limit;
        this.remaining = remaining;
        this.resetTime = resetTime;
    }

    override toResponse(): Response {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        if (this.retryAfter) {
            headers["Retry-After"] = String(this.retryAfter);
        }
        if (this.limit !== undefined) {
            headers["X-RateLimit-Limit"] = String(this.limit);
        }
        if (this.remaining !== undefined) {
            headers["X-RateLimit-Remaining"] = String(this.remaining);
        }
        if (this.resetTime) {
            headers["X-RateLimit-Reset"] = String(this.resetTime);
        }

        return new Response(JSON.stringify(this.toJSON()), {
            status: this.statusCode,
            headers,
        });
    }

    override toJSON(): Record<string, unknown> {
        return {
            error: {
                code: this.code,
                message: this.message,
                statusCode: this.statusCode,
                ...(this.retryAfter && { retryAfter: this.retryAfter }),
                ...(this.limit !== undefined && { limit: this.limit }),
                ...(this.remaining !== undefined && { remaining: this.remaining }),
                ...(this.resetTime && { resetTime: this.resetTime }),
            },
        };
    }
}

/**
 * Database operation errors
 */
export class DatabaseError extends CloudflareKitError {
    readonly query?: string;
    readonly originalError?: Error;

    constructor(message: string, query?: string, originalError?: Error) {
        super(message, "DATABASE_ERROR", 500, false);
        this.query = query;
        this.originalError = originalError;
    }
}

/**
 * Cache operation errors
 */
export class CacheError extends CloudflareKitError {
    readonly key?: string;

    constructor(message: string, key?: string) {
        super(message, "CACHE_ERROR", 500, false);
        this.key = key;
    }
}

/**
 * Configuration errors
 */
export class ConfigError extends CloudflareKitError {
    readonly key?: string;

    constructor(message: string, key?: string) {
        super(message, "CONFIG_ERROR", 500, false);
        this.key = key;
    }
}

/**
 * Plugin errors
 */
export class PluginError extends CloudflareKitError {
    readonly pluginName?: string;

    constructor(message: string, pluginName?: string) {
        super(message, "PLUGIN_ERROR", 500, false);
        this.pluginName = pluginName;
    }
}

/**
 * Type guard to check if error is a CloudflareKitError
 */
export function isCloudflareKitError(error: unknown): error is CloudflareKitError {
    return error instanceof CloudflareKitError;
}

/**
 * Type guard to check if error is an operational error
 */
export function isOperationalError(error: unknown): boolean {
    if (isCloudflareKitError(error)) {
        return error.isOperational;
    }
    return false;
}

/**
 * Global error handler for unhandled errors
 */
export function handleError(error: unknown): Response {
    if (isCloudflareKitError(error)) {
        return error.toResponse();
    }

    // Unknown error - don't expose details in production
    const isDev = (globalThis as { ENVIRONMENT?: string }).ENVIRONMENT === "development";
    const message = isDev && error instanceof Error ? error.message : "Internal Server Error";

    return new Response(
        JSON.stringify({
            error: {
                code: "INTERNAL_ERROR",
                message,
                statusCode: 500,
                ...(isDev && error instanceof Error && { stack: error.stack }),
            },
        }),
        {
            status: 500,
            headers: { "Content-Type": "application/json" },
        },
    );
}
