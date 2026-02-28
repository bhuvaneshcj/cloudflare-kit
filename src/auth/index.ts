/**
 * Authentication Module
 *
 * Provides createAuth() for JWT and session-based authentication.
 */

import type { D1Database } from "../database/types";

/**
 * Encode string to base64url (URL-safe base64)
 */
function base64urlEncode(str: string): string {
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Decode base64url string
 */
function base64urlDecode(str: string): string {
    // Restore padding
    const padding = "=".repeat((4 - (str.length % 4)) % 4);
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + padding;
    return atob(base64);
}

export interface AuthOptions {
    jwtSecret: string;
    sessionDuration?: number; // in seconds, default 7 days
    database?: D1Database;
}

export interface User {
    id: string;
    email: string;
    [key: string]: unknown;
}

export interface Session {
    id: string;
    userId: string;
    expiresAt: Date;
}

export interface AuthResult {
    success: boolean;
    user?: User;
    token?: string;
    error?: string;
}

/**
 * Create an authentication service
 *
 * @example
 * ```typescript
 * const auth = createAuth({
 *   jwtSecret: env.JWT_SECRET,
 *   sessionDuration: 60 * 60 * 24 * 7, // 7 days
 *   database: database
 * });
 *
 * // Create a token for a user
 * const result = await auth.createToken({ id: '123', email: 'user@example.com' });
 *
 * // Verify a token
 * const user = await auth.verifyToken(request.headers.get('Authorization'));
 * ```
 */
export function createAuth(options: AuthOptions) {
    const sessionDuration = options.sessionDuration || 60 * 60 * 24 * 7; // 7 days default

    return {
        /**
         * Create a JWT token for a user
         */
        async createToken(user: User): Promise<AuthResult> {
            try {
                const header = { alg: "HS256", typ: "JWT" };
                const now = Math.floor(Date.now() / 1000);
                const payload = {
                    sub: user.id,
                    email: user.email,
                    iat: now,
                    exp: now + sessionDuration,
                };

                const encodedHeader = base64urlEncode(JSON.stringify(header));
                const encodedPayload = base64urlEncode(JSON.stringify(payload));
                const data = `${encodedHeader}.${encodedPayload}`;

                // Sign the token
                const encoder = new TextEncoder();
                const key = await crypto.subtle.importKey(
                    "raw",
                    encoder.encode(options.jwtSecret),
                    { name: "HMAC", hash: "SHA-256" },
                    false,
                    ["sign"],
                );

                const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
                const encodedSignature = base64urlEncode(String.fromCharCode(...new Uint8Array(signature)));

                const token = `${data}.${encodedSignature}`;

                return { success: true, user, token };
            } catch (error) {
                return { success: false, error: "Failed to create token" };
            }
        },

        /**
         * Verify a JWT token
         */
        async verifyToken(authHeader: string | null): Promise<AuthResult> {
            if (!authHeader?.startsWith("Bearer ")) {
                return { success: false, error: "Invalid authorization header" };
            }

            const token = authHeader.slice(7);

            try {
                const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");

                if (!encodedHeader || !encodedPayload || !encodedSignature) {
                    return { success: false, error: "Invalid token format" };
                }

                // Verify signature
                const data = `${encodedHeader}.${encodedPayload}`;
                const encoder = new TextEncoder();
                const key = await crypto.subtle.importKey(
                    "raw",
                    encoder.encode(options.jwtSecret),
                    { name: "HMAC", hash: "SHA-256" },
                    false,
                    ["verify"],
                );

                const signatureBytes = Uint8Array.from(base64urlDecode(encodedSignature), (c) => c.charCodeAt(0));
                const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(data));

                if (!isValid) {
                    return { success: false, error: "Invalid token signature" };
                }

                // Parse payload
                const payload = JSON.parse(base64urlDecode(encodedPayload));

                // Check expiration
                if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                    return { success: false, error: "Token expired" };
                }

                const user: User = {
                    id: payload.sub,
                    email: payload.email,
                };

                return { success: true, user };
            } catch {
                return { success: false, error: "Invalid token" };
            }
        },

        /**
         * Create a session (for cookie-based auth)
         */
        async createSession(user: User): Promise<AuthResult> {
            if (!options.database) {
                return { success: false, error: "Database required for sessions" };
            }

            const sessionId = crypto.randomUUID();
            const expiresAt = new Date(Date.now() + sessionDuration * 1000);

            try {
                await options.database.execute("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", [
                    sessionId,
                    user.id,
                    expiresAt.toISOString(),
                ]);

                return {
                    success: true,
                    user,
                    token: sessionId,
                };
            } catch {
                return { success: false, error: "Failed to create session" };
            }
        },

        /**
         * Verify a session
         */
        async verifySession(sessionId: string): Promise<AuthResult> {
            if (!options.database) {
                return { success: false, error: "Database required for sessions" };
            }

            try {
                const result = await options.database.query(
                    'SELECT s.*, u.id as user_id, u.email FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > datetime("now")',
                    [sessionId],
                );

                if (result.results.length === 0) {
                    return { success: false, error: "Invalid or expired session" };
                }

                const row = result.results[0] as Record<string, string>;
                const user: User = {
                    id: row.user_id,
                    email: row.email,
                };

                return { success: true, user };
            } catch {
                return { success: false, error: "Failed to verify session" };
            }
        },
    };
}

// Types are already exported via interfaces above
