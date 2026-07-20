/**
 * Response Helpers
 *
 * Simple utilities for creating common HTTP responses.
 */

export type ResponseHeaders = HeadersInit | Record<string, string>;

function mergeHeaders(base: Record<string, string>, extra?: ResponseHeaders): Headers {
    const headers = new Headers(base);
    if (!extra) return headers;
    if (extra instanceof Headers) {
        extra.forEach((value, key) => headers.set(key, value));
        return headers;
    }
    if (Array.isArray(extra)) {
        for (const [key, value] of extra) {
            headers.set(key, value);
        }
        return headers;
    }
    for (const [key, value] of Object.entries(extra)) {
        headers.set(key, value);
    }
    return headers;
}

/**
 * Create a JSON response
 *
 * @example
 * ```typescript
 * return jsonResponse({ users: [] });
 * return jsonResponse({ user }, 201);
 * return jsonResponse({ user }, 201, { "X-Request-Id": "abc" });
 * ```
 */
export function jsonResponse(data: unknown, status: number = 200, headers?: ResponseHeaders): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: mergeHeaders({ "Content-Type": "application/json" }, headers),
    });
}

/**
 * Create an error response
 *
 * @example
 * ```typescript
 * return errorResponse('User not found', 404);
 * return errorResponse('Invalid input', 400, { details: [{ field: 'email', message: 'required' }] });
 * ```
 */
export function errorResponse(message: string, status: number = 500, details?: unknown, headers?: ResponseHeaders): Response {
    const body: Record<string, unknown> = { error: message };
    if (details !== undefined) {
        body.details = details;
    }
    return jsonResponse(body, status, headers);
}

/**
 * Create a success response
 *
 * @example
 * ```typescript
 * return successResponse('User created');
 * return successResponse({ id: 1 }, 201);
 * ```
 */
export function successResponse(messageOrData: string | Record<string, unknown>, status: number = 200, headers?: ResponseHeaders): Response {
    if (typeof messageOrData === "string") {
        return jsonResponse({ success: true, message: messageOrData }, status, headers);
    }
    return jsonResponse({ success: true, ...messageOrData }, status, headers);
}

/**
 * Create a redirect response
 */
export function redirectResponse(location: string, status: number = 302, headers?: ResponseHeaders): Response {
    return new Response(null, {
        status,
        headers: mergeHeaders({ Location: location }, headers),
    });
}
