/**
 * Authentication Module
 *
 * Provides createAuth() for JWT and session-based authentication,
 * plus requireAuth() middleware.
 */

import type { D1Database } from "../database/types";
import type { Middleware, RequestContext } from "../core/types";
import { AuthError, ConfigError } from "../errors/index";
import { errorResponse } from "../core/response";

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlToBytes(str: string): Uint8Array {
    const padding = "=".repeat((4 - (str.length % 4)) % 4);
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + padding;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function base64urlEncodeJson(value: unknown): string {
    const json = JSON.stringify(value);
    return bytesToBase64Url(new TextEncoder().encode(json));
}

function base64urlDecodeJson<T = unknown>(str: string): T {
    const bytes = base64UrlToBytes(str);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export type SecretInput = string | ((env: Record<string, unknown>) => string);

export interface AuthOptions {
    /** JWT secret (alias of jwtSecret) */
    secret?: SecretInput;
    /** JWT secret (alias of secret) */
    jwtSecret?: SecretInput;
    /** Token lifetime in seconds (alias of sessionDuration) */
    expiresIn?: number;
    /** Token lifetime in seconds (alias of expiresIn) */
    sessionDuration?: number;
    issuer?: string;
    audience?: string;
    database?: D1Database;
}

export interface User {
    id: string;
    email: string;
    role?: string;
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
    payload?: Record<string, unknown>;
}

export interface AuthService {
    createToken(user: User | Record<string, unknown>, env?: Record<string, unknown>): Promise<AuthResult>;
    verifyToken(authHeaderOrToken: string | null, env?: Record<string, unknown>): Promise<AuthResult>;
    createSession(user: User): Promise<AuthResult>;
    verifySession(sessionId: string): Promise<AuthResult>;
    resolveSecret(env?: Record<string, unknown>): string;
}

function resolveSecretInput(input: SecretInput | undefined, env?: Record<string, unknown>): string {
    if (input === undefined) {
        throw new ConfigError("JWT secret is required (secret or jwtSecret)");
    }
    if (typeof input === "function") {
        if (!env) {
            throw new ConfigError("JWT secret is a function but no env was provided");
        }
        return input(env);
    }
    return input;
}

/**
 * Create an authentication service
 */
export function createAuth(options: AuthOptions): AuthService {
    const secretInput = options.secret ?? options.jwtSecret;
    const sessionDuration = options.expiresIn ?? options.sessionDuration ?? 60 * 60 * 24 * 7;

    function getSecret(env?: Record<string, unknown>): string {
        const secret = resolveSecretInput(secretInput, env);
        if (secret.length < 32) {
            throw new ConfigError("JWT secret must be at least 32 characters for security");
        }
        return secret;
    }

    // Eager-validate static secrets at creation time
    if (typeof secretInput === "string") {
        getSecret();
    }

    return {
        resolveSecret: getSecret,

        async createToken(user: User | Record<string, unknown>, env?: Record<string, unknown>): Promise<AuthResult> {
            try {
                const secret = getSecret(env);
                const header = { alg: "HS256", typ: "JWT" };
                const now = Math.floor(Date.now() / 1000);

                const id = "id" in user && typeof user.id === "string" ? user.id : String((user as { sub?: string }).sub ?? "");
                const email = typeof user.email === "string" ? user.email : "";

                const payload: Record<string, unknown> = {
                    sub: id,
                    email,
                    iat: now,
                    exp: now + sessionDuration,
                    ...("role" in user && user.role !== undefined ? { role: user.role } : {}),
                };

                if (options.issuer) payload.iss = options.issuer;
                if (options.audience) payload.aud = options.audience;

                // Allow extra claims from user object (except reserved)
                for (const [key, value] of Object.entries(user)) {
                    if (!["id", "email", "role", "sub", "iat", "exp", "iss", "aud"].includes(key)) {
                        payload[key] = value;
                    }
                }

                const encodedHeader = base64urlEncodeJson(header);
                const encodedPayload = base64urlEncodeJson(payload);
                const data = `${encodedHeader}.${encodedPayload}`;

                const encoder = new TextEncoder();
                const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

                const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
                const encodedSignature = bytesToBase64Url(new Uint8Array(signature));
                const token = `${data}.${encodedSignature}`;

                const resultUser: User = {
                    id,
                    email,
                    ...(typeof user.role === "string" ? { role: user.role } : {}),
                };

                return { success: true, user: resultUser, token, payload };
            } catch (error) {
                if (error instanceof ConfigError) throw error;
                return { success: false, error: "Failed to create token" };
            }
        },

        async verifyToken(authHeaderOrToken: string | null, env?: Record<string, unknown>): Promise<AuthResult> {
            if (!authHeaderOrToken) {
                return { success: false, error: "Invalid authorization header" };
            }

            const token = authHeaderOrToken.startsWith("Bearer ") ? authHeaderOrToken.slice(7) : authHeaderOrToken;

            try {
                const secret = getSecret(env);
                const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");

                if (!encodedHeader || !encodedPayload || !encodedSignature) {
                    return { success: false, error: "Invalid token format" };
                }

                let header: { alg?: string; typ?: string };
                try {
                    header = base64urlDecodeJson(encodedHeader);
                } catch {
                    return { success: false, error: "Invalid token header" };
                }

                if (header.alg !== "HS256") {
                    return { success: false, error: "Invalid algorithm" };
                }
                if (header.typ !== "JWT") {
                    return { success: false, error: "Invalid token type" };
                }

                const data = `${encodedHeader}.${encodedPayload}`;
                const encoder = new TextEncoder();
                const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);

                const signatureBytes = base64UrlToBytes(encodedSignature);
                const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(data));

                if (!isValid) {
                    return { success: false, error: "Invalid token signature" };
                }

                const payload = base64urlDecodeJson<Record<string, unknown>>(encodedPayload);

                if (typeof payload.exp !== "number") {
                    return { success: false, error: "Token missing expiration" };
                }
                if (payload.exp < Math.floor(Date.now() / 1000)) {
                    return { success: false, error: "Token expired" };
                }

                if (options.issuer && payload.iss !== options.issuer) {
                    return { success: false, error: "Invalid issuer" };
                }
                if (options.audience && payload.aud !== options.audience) {
                    return { success: false, error: "Invalid audience" };
                }

                const user: User = {
                    id: String(payload.sub ?? ""),
                    email: String(payload.email ?? ""),
                    ...(typeof payload.role === "string" ? { role: payload.role } : {}),
                };

                return { success: true, user, payload };
            } catch (error) {
                if (error instanceof ConfigError) throw error;
                return { success: false, error: "Invalid token" };
            }
        },

        async createSession(user: User): Promise<AuthResult> {
            if (!options.database) {
                return { success: false, error: "Database required for sessions" };
            }

            const sessionId = crypto.randomUUID();
            const expiresAt = new Date(Date.now() + sessionDuration * 1000);

            try {
                await options.database
                    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
                    .bind(sessionId, user.id, expiresAt.toISOString())
                    .run();

                return {
                    success: true,
                    user,
                    token: sessionId,
                };
            } catch {
                return { success: false, error: "Failed to create session" };
            }
        },

        async verifySession(sessionId: string): Promise<AuthResult> {
            if (!options.database) {
                return { success: false, error: "Database required for sessions" };
            }

            try {
                const result = await options.database
                    .prepare(
                        'SELECT s.*, u.id as user_id, u.email FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > datetime("now")',
                    )
                    .bind(sessionId)
                    .all();

                if (!result.results || result.results.length === 0) {
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

export interface RequireAuthOptions {
    roles?: string[];
}

/**
 * Middleware that requires a valid JWT Bearer token
 */
export function requireAuth(auth: AuthService, options: RequireAuthOptions = {}): Middleware {
    return async (context: RequestContext): Promise<Response | void> => {
        const header = context.request.headers.get("Authorization");
        const result = await auth.verifyToken(header, context.env);

        if (!result.success || !result.user) {
            return errorResponse(result.error || "Authentication required", 401);
        }

        if (options.roles && options.roles.length > 0) {
            const role = result.user.role;
            if (!role || !options.roles.includes(role)) {
                const err = AuthError.insufficientPermissions();
                return err.toResponse();
            }
        }

        context.state.user = result.user;
        context.state.payload = result.payload;
        (context as RequestContext & { user?: User }).user = result.user;
        return undefined;
    };
}
