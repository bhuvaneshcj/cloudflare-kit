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
export function jsonResponse(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
        },
    });
}

/**
 * Create an error response
 *
 * @example
 * ```typescript
 * return errorResponse('User not found', 404);
 * return errorResponse('Invalid input', 400);
 * ```
 */
export function errorResponse(message: string, status: number = 500): Response {
    return jsonResponse({ error: message }, status);
}

/**
 * Create a success response
 *
 * @example
 * ```typescript
 * return successResponse('User created');
 * ```
 */
export function successResponse(message: string, status: number = 200): Response {
    return jsonResponse({ success: true, message }, status);
}

/**
 * Create a redirect response
 *
 * @example
 * ```typescript
 * return redirectResponse('/login');
 * return redirectResponse('/dashboard', 301);
 * ```
 */
export function redirectResponse(location: string, status: number = 302): Response {
    return new Response(null, {
        status,
        headers: {
            Location: location,
        },
    });
}
