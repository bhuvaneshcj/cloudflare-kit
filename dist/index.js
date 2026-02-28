/*! Cloudflare Kit v1.0.0 | MIT License | github.com/bhuvaneshcj/cloudflare-stack */
function O(s, t) {
    if (!t) return s;
    let r = new Headers(s.headers);
    for (let [e, n] of Object.entries(t)) r.set(e, n);
    return new Response(s.body, { status: s.status, statusText: s.statusText, headers: r });
}
function q(s = {}) {
    let t = [],
        r = new Map();
    return {
        use(e) {
            return (t.push(e), this);
        },
        get(e, n) {
            return (r.set(`GET:${e}`, n), this);
        },
        post(e, n) {
            return (r.set(`POST:${e}`, n), this);
        },
        put(e, n) {
            return (r.set(`PUT:${e}`, n), this);
        },
        delete(e, n) {
            return (r.set(`DELETE:${e}`, n), this);
        },
        patch(e, n) {
            return (r.set(`PATCH:${e}`, n), this);
        },
        async fetch(e, n, i) {
            let o = new URL(e.url),
                u = `${e.method}:${o.pathname}`,
                c = { request: e, url: o, env: n, executionContext: i, state: {}, ...s };
            for (let l of t) {
                let d = await l(c);
                if (d instanceof Response) return O(d, c.state.corsHeaders);
            }
            let g = r.get(u);
            if (g)
                try {
                    let l = await g(c);
                    return O(l, c.state.corsHeaders);
                } catch (l) {
                    return (
                        console.error("Handler error:", l),
                        new Response(JSON.stringify({ error: "Internal server error" }), {
                            status: 500,
                            headers: { "Content-Type": "application/json" },
                        })
                    );
                }
            return new Response("Not Found", { status: 404 });
        },
    };
}
function b(s, t = 200) {
    return new Response(JSON.stringify(s), { status: t, headers: { "Content-Type": "application/json" } });
}
function y(s, t = 500) {
    return b({ error: s }, t);
}
function U(s, t = 200) {
    return b({ success: true, message: s }, t);
}
function j(s, t = 302) {
    return new Response(null, { status: t, headers: { Location: s } });
}
function K(s = {}) {
    let t = s.origin || "*",
        r = s.methods || "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        e = s.allowHeaders || "Content-Type, Authorization",
        n = s.credentials;
    return async (i) => {
        if (i.request.method === "OPTIONS") {
            let o = {
                "Access-Control-Allow-Origin": t,
                "Access-Control-Allow-Methods": r,
                "Access-Control-Allow-Headers": e,
            };
            return (
                n && (o["Access-Control-Allow-Credentials"] = "true"),
                new Response(null, { status: 204, headers: o })
            );
        }
        i.state.corsHeaders = {
            "Access-Control-Allow-Origin": t,
            ...(n && { "Access-Control-Allow-Credentials": "true" }),
        };
    };
}
function V() {
    return async (s) => {
        if (s.request.headers.get("content-type")?.includes("application/json"))
            try {
                let r = await s.request.json();
                s.state.body = r;
            } catch {
                return y("Invalid JSON", 400);
            }
    };
}
function B() {
    return async () => {};
}
function T(s) {
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function D(s) {
    let t = "=".repeat((4 - (s.length % 4)) % 4),
        r = s.replace(/-/g, "+").replace(/_/g, "/") + t;
    return atob(r);
}
function F(s) {
    let t = s.sessionDuration || 604800;
    return {
        async createToken(r) {
            try {
                let e = { alg: "HS256", typ: "JWT" },
                    n = Math.floor(Date.now() / 1e3),
                    i = { sub: r.id, email: r.email, iat: n, exp: n + t },
                    o = T(JSON.stringify(e)),
                    a = T(JSON.stringify(i)),
                    u = `${o}.${a}`,
                    c = new TextEncoder(),
                    g = await crypto.subtle.importKey(
                        "raw",
                        c.encode(s.jwtSecret),
                        { name: "HMAC", hash: "SHA-256" },
                        !1,
                        ["sign"],
                    ),
                    l = await crypto.subtle.sign("HMAC", g, c.encode(u)),
                    d = T(String.fromCharCode(...new Uint8Array(l))),
                    f = `${u}.${d}`;
                return { success: !0, user: r, token: f };
            } catch {
                return { success: false, error: "Failed to create token" };
            }
        },
        async verifyToken(r) {
            if (!r?.startsWith("Bearer ")) return { success: false, error: "Invalid authorization header" };
            let e = r.slice(7);
            try {
                let [n, i, o] = e.split(".");
                if (!n || !i || !o) return { success: !1, error: "Invalid token format" };
                let a = `${n}.${i}`,
                    u = new TextEncoder(),
                    c = await crypto.subtle.importKey(
                        "raw",
                        u.encode(s.jwtSecret),
                        { name: "HMAC", hash: "SHA-256" },
                        !1,
                        ["verify"],
                    ),
                    g = Uint8Array.from(D(o), (h) => h.charCodeAt(0));
                if (!(await crypto.subtle.verify("HMAC", c, g, u.encode(a))))
                    return { success: !1, error: "Invalid token signature" };
                let d = JSON.parse(D(i));
                return d.exp && d.exp < Math.floor(Date.now() / 1e3)
                    ? { success: !1, error: "Token expired" }
                    : { success: !0, user: { id: d.sub, email: d.email } };
            } catch {
                return { success: false, error: "Invalid token" };
            }
        },
        async createSession(r) {
            if (!s.database) return { success: false, error: "Database required for sessions" };
            let e = crypto.randomUUID(),
                n = new Date(Date.now() + t * 1e3);
            try {
                return (
                    await s.database.execute("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", [
                        e,
                        r.id,
                        n.toISOString(),
                    ]),
                    { success: !0, user: r, token: e }
                );
            } catch {
                return { success: false, error: "Failed to create session" };
            }
        },
        async verifySession(r) {
            if (!s.database) return { success: false, error: "Database required for sessions" };
            try {
                let e = await s.database.query(
                    'SELECT s.*, u.id as user_id, u.email FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > datetime("now")',
                    [r],
                );
                if (e.results.length === 0) return { success: !1, error: "Invalid or expired session" };
                let n = e.results[0];
                return { success: !0, user: { id: n.user_id, email: n.email } };
            } catch {
                return { success: false, error: "Failed to verify session" };
            }
        },
    };
}
function R(s) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) throw new Error(`Invalid SQL identifier: ${s}`);
    return s;
}
function _(s) {
    let t = s.binding;
    return {
        async query(r, e = []) {
            try {
                return await t
                    .prepare(r)
                    .bind(...e)
                    .all();
            } catch (n) {
                return { results: [], success: false, error: n instanceof Error ? n.message : "Unknown error" };
            }
        },
        async get(r, e = []) {
            try {
                return await t
                    .prepare(r)
                    .bind(...e)
                    .first();
            } catch {
                return null;
            }
        },
        async execute(r, e = []) {
            try {
                return await t
                    .prepare(r)
                    .bind(...e)
                    .run();
            } catch (n) {
                return { results: [], success: false, error: n instanceof Error ? n.message : "Unknown error" };
            }
        },
        async insert(r, e) {
            R(r);
            let n = Object.keys(e),
                i = Object.values(e);
            n.forEach(R);
            let o = n.map(() => "?").join(", "),
                a = `INSERT INTO ${r} (${n.join(", ")}) VALUES (${o})`;
            return (await this.execute(a, i)).meta?.last_row_id ?? null;
        },
        async update(r, e, n, i) {
            R(r);
            let o = Object.keys(e),
                a = Object.values(e);
            o.forEach(R);
            let u = o.map((l) => `${l} = ?`).join(", "),
                c = `UPDATE ${r} SET ${u} WHERE ${n}`;
            return (await this.execute(c, [...a, ...i])).meta?.changes ?? 0;
        },
        async delete(r, e, n) {
            R(r);
            let i = `DELETE FROM ${r} WHERE ${e}`;
            return (await this.execute(i, n)).meta?.changes ?? 0;
        },
        async batch(r) {
            try {
                let e = r.map((i) => t.prepare(i.sql).bind(...i.params));
                return await t.batch(e);
            } catch (e) {
                return [{ results: [], success: false, error: e instanceof Error ? e.message : "Unknown error" }];
            }
        },
        getBinding() {
            return t;
        },
    };
}
function J(s) {
    let t = s.binding,
        r = s.defaultTTL;
    return {
        async get(e) {
            try {
                return await t.get(e, "json");
            } catch {
                return null;
            }
        },
        async getString(e) {
            try {
                return await t.get(e, "text");
            } catch {
                return null;
            }
        },
        async set(e, n, i) {
            let o = i ?? r;
            try {
                o ? await t.put(e, JSON.stringify(n), { expirationTtl: o }) : await t.put(e, JSON.stringify(n));
            } catch (a) {
                console.error("Cache set error:", a);
            }
        },
        async setString(e, n, i) {
            let o = i ?? r;
            try {
                o ? await t.put(e, n, { expirationTtl: o }) : await t.put(e, n);
            } catch (a) {
                console.error("Cache set error:", a);
            }
        },
        async delete(e) {
            try {
                await t.delete(e);
            } catch (n) {
                console.error("Cache delete error:", n);
            }
        },
        async has(e) {
            return (await t.get(e)) !== null;
        },
        async getMultiple(e) {
            let n = {};
            return (
                await Promise.all(
                    e.map(async (i) => {
                        n[i] = await this.get(i);
                    }),
                ),
                n
            );
        },
        async getOrSet(e, n, i) {
            let o = await this.get(e);
            if (o !== null) return o;
            let a = await n();
            return (await this.set(e, a, i), a);
        },
        async listKeys(e) {
            let n = await t.list({ prefix: e?.prefix, limit: e?.limit, cursor: e?.cursor });
            return { keys: n.keys.map((i) => i.name), cursor: n.list_complete ? void 0 : n.cursor };
        },
        getBinding() {
            return t;
        },
    };
}
function Q(s) {
    let t = s.binding;
    return {
        async upload(r, e, n) {
            try {
                let i = await t.put(r, e, {
                    httpMetadata: n?.contentType ? { contentType: n.contentType } : void 0,
                    customMetadata: n?.customMetadata,
                });
                return { success: !0, key: i.key, size: i.size, etag: i.etag };
            } catch (i) {
                return { success: false, error: i instanceof Error ? i.message : "Upload failed" };
            }
        },
        async download(r) {
            try {
                let e = await t.get(r);
                return e
                    ? { success: !0, data: e.body, contentType: e.httpMetadata?.contentType, size: e.size }
                    : { success: !1, error: "File not found" };
            } catch (e) {
                return { success: false, error: e instanceof Error ? e.message : "Download failed" };
            }
        },
        async getMetadata(r) {
            try {
                let e = await t.head(r);
                return e
                    ? {
                          success: !0,
                          size: e.size,
                          etag: e.etag,
                          contentType: e.httpMetadata?.contentType,
                          uploaded: e.uploaded,
                          customMetadata: e.customMetadata,
                      }
                    : { success: !1, error: "File not found" };
            } catch (e) {
                return { success: false, error: e instanceof Error ? e.message : "Failed to get metadata" };
            }
        },
        async delete(r) {
            try {
                return (await t.delete(r), { success: !0 });
            } catch (e) {
                return { success: false, error: e instanceof Error ? e.message : "Delete failed" };
            }
        },
        async deleteMultiple(r) {
            try {
                return (await t.delete(r), { success: !0 });
            } catch (e) {
                return { success: false, error: e instanceof Error ? e.message : "Delete failed" };
            }
        },
        async exists(r) {
            try {
                return (await t.head(r)) !== null;
            } catch {
                return false;
            }
        },
        async list(r) {
            try {
                let e = await t.list({ prefix: r?.prefix, limit: r?.limit, cursor: r?.cursor });
                return {
                    success: !0,
                    files: e.objects.map((n) => ({ key: n.key, size: n.size, etag: n.etag, uploaded: n.uploaded })),
                    cursor: e.truncated ? e.cursor : void 0,
                };
            } catch (e) {
                return { success: false, files: [], error: e instanceof Error ? e.message : "List failed" };
            }
        },
        async getPublicUrl(r) {
            return `https://storage.example.com/${r}`;
        },
        getBinding() {
            return t;
        },
    };
}
function z(s) {
    let t = s.binding;
    return {
        async send(r, e) {
            try {
                return (await t.send(r, { delaySeconds: e?.delaySeconds }), { success: !0 });
            } catch (n) {
                return { success: false, error: n instanceof Error ? n.message : "Failed to send message" };
            }
        },
        async sendBatch(r) {
            try {
                let e = r.map((n) => ({ body: n }));
                return (await t.sendBatch(e), { success: !0 });
            } catch (e) {
                return { success: false, error: e instanceof Error ? e.message : "Failed to send batch" };
            }
        },
        getBinding() {
            return t;
        },
    };
}
function G(s) {
    return async (t, r, e) => {
        for (let n of t.messages)
            try {
                (await s(n.body), n.ack());
            } catch (i) {
                (console.error("Failed to process message:", i), n.retry());
            }
    };
}
var C = { debug: 0, info: 1, warn: 2, error: 3 };
function N(s = {}) {
    let t = s.level || "info",
        r = s.service || "app",
        e = s.environment || "development";
    function n(a) {
        return C[a] >= C[t];
    }
    function i(a, u, c) {
        return {
            timestamp: new Date().toISOString(),
            level: a.toUpperCase(),
            message: u,
            service: r,
            environment: e,
            ...(c && { data: c }),
        };
    }
    function o(a) {
        let u = JSON.stringify(a);
        switch (a.level) {
            case "ERROR":
                console.error(u);
                break;
            case "WARN":
                console.warn(u);
                break;
            default:
                console.log(u);
        }
    }
    return {
        debug(a, u) {
            n("debug") && o(i("debug", a, u));
        },
        info(a, u) {
            n("info") && o(i("info", a, u));
        },
        warn(a, u) {
            n("warn") && o(i("warn", a, u));
        },
        error(a, u) {
            n("error") && o(i("error", a, u));
        },
        child(a) {
            return {
                debug(u, c) {
                    n("debug") && o(i("debug", u, { ...a, ...c }));
                },
                info(u, c) {
                    n("info") && o(i("info", u, { ...a, ...c }));
                },
                warn(u, c) {
                    n("warn") && o(i("warn", u, { ...a, ...c }));
                },
                error(u, c) {
                    n("error") && o(i("error", u, { ...a, ...c }));
                },
                child(u) {
                    return N({ level: t, service: r, environment: e }).child({ ...a, ...u });
                },
                getLevel() {
                    return t;
                },
            };
        },
        getLevel() {
            return t;
        },
    };
}
function W(s) {
    let t = new Map();
    return async (r) => {
        let e = s.keyGenerator ? s.keyGenerator(r.request) : r.request.headers.get("CF-Connecting-IP") || "unknown",
            n = Date.now(),
            i = s.windowSeconds * 1e3,
            o = t.get(e);
        if (
            ((!o || n > o.resetAt) && ((o = { count: 0, resetAt: n + i }), t.set(e, o)),
            o.count++,
            o.count > s.maxRequests)
        )
            return y("Rate limit exceeded", 429);
    };
}
function X(s) {
    return async (t) => {
        let r = t.state.body;
        if (!r) return y("Request body required", 400);
        let e = [];
        for (let [n, i] of Object.entries(s)) {
            let o = r[n];
            if (i.required && (o == null || o === "")) {
                e.push(`${n} is required`);
                continue;
            }
            o != null &&
                (i.type === "email"
                    ? (typeof o != "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o)) &&
                      e.push(`${n} must be a valid email`)
                    : i.type === "string"
                      ? typeof o != "string"
                          ? e.push(`${n} must be a string`)
                          : (i.minLength &&
                                o.length < i.minLength &&
                                e.push(`${n} must be at least ${i.minLength} characters`),
                            i.maxLength &&
                                o.length > i.maxLength &&
                                e.push(`${n} must be at most ${i.maxLength} characters`),
                            i.pattern && !i.pattern.test(o) && e.push(`${n} format is invalid`))
                      : i.type === "number"
                        ? (typeof o != "number" || isNaN(o)) && e.push(`${n} must be a number`)
                        : i.type === "boolean" && typeof o != "boolean" && e.push(`${n} must be a boolean`));
        }
        if (e.length > 0) return y(e.join(", "), 400);
    };
}
var p = class extends Error {
        code;
        statusCode;
        isOperational;
        timestamp;
        constructor(t, r, e = 500, n = true) {
            (super(t),
                (this.name = this.constructor.name),
                (this.code = r),
                (this.statusCode = e),
                (this.isOperational = n),
                (this.timestamp = new Date().toISOString()),
                Object.setPrototypeOf(this, new.target.prototype));
        }
        toJSON() {
            return {
                error: {
                    code: this.code,
                    message: this.message,
                    statusCode: this.statusCode,
                    ...(globalThis.ENVIRONMENT === "development" && { stack: this.stack }),
                },
            };
        }
        toResponse() {
            return new Response(JSON.stringify(this.toJSON()), {
                status: this.statusCode,
                headers: { "Content-Type": "application/json" },
            });
        }
    },
    E = class s extends p {
        constructor(t, r = 500, e) {
            super(t, e || `HTTP_${r}`, r, true);
        }
        static badRequest(t = "Bad Request") {
            return new s(t, 400, "BAD_REQUEST");
        }
        static unauthorized(t = "Unauthorized") {
            return new s(t, 401, "UNAUTHORIZED");
        }
        static forbidden(t = "Forbidden") {
            return new s(t, 403, "FORBIDDEN");
        }
        static notFound(t = "Not Found") {
            return new s(t, 404, "NOT_FOUND");
        }
        static methodNotAllowed(t = "Method Not Allowed") {
            return new s(t, 405, "METHOD_NOT_ALLOWED");
        }
        static conflict(t = "Conflict") {
            return new s(t, 409, "CONFLICT");
        }
        static unprocessable(t = "Unprocessable Entity") {
            return new s(t, 422, "UNPROCESSABLE_ENTITY");
        }
        static tooManyRequests(t = "Too Many Requests", r) {
            return new w(t, r);
        }
        static internal(t = "Internal Server Error") {
            return new s(t, 500, "INTERNAL_ERROR");
        }
        static notImplemented(t = "Not Implemented") {
            return new s(t, 501, "NOT_IMPLEMENTED");
        }
        static badGateway(t = "Bad Gateway") {
            return new s(t, 502, "BAD_GATEWAY");
        }
        static serviceUnavailable(t = "Service Unavailable") {
            return new s(t, 503, "SERVICE_UNAVAILABLE");
        }
    },
    k = class s extends p {
        field;
        errors;
        constructor(t, r, e = []) {
            (super(t, "VALIDATION_ERROR", 400, true), (this.field = r), (this.errors = e));
        }
        toJSON() {
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
        static fromZodError(t) {
            let r = t.issues.map((e) => ({ field: e.path.join("."), message: e.message, code: e.code }));
            return new s(`Validation failed: ${r.map((e) => `${e.field} - ${e.message}`).join(", ")}`, void 0, r);
        }
    },
    P = class s extends p {
        constructor(t, r = "AUTH_ERROR") {
            super(t, r, 401, true);
        }
        static invalidToken(t = "Invalid or expired token") {
            return new s(t, "INVALID_TOKEN");
        }
        static missingToken(t = "Authentication required") {
            return new s(t, "MISSING_TOKEN");
        }
        static expiredToken(t = "Token has expired") {
            return new s(t, "TOKEN_EXPIRED");
        }
        static insufficientPermissions(t = "Insufficient permissions") {
            return new s(t, "FORBIDDEN");
        }
        static invalidCredentials(t = "Invalid credentials") {
            return new s(t, "INVALID_CREDENTIALS");
        }
    },
    w = class extends p {
        retryAfter;
        limit;
        remaining;
        resetTime;
        constructor(t = "Too Many Requests", r, e, n, i) {
            (super(t, "RATE_LIMITED", 429, true),
                (this.retryAfter = r),
                (this.limit = e),
                (this.remaining = n),
                (this.resetTime = i));
        }
        toResponse() {
            let t = { "Content-Type": "application/json" };
            return (
                this.retryAfter && (t["Retry-After"] = String(this.retryAfter)),
                this.limit !== void 0 && (t["X-RateLimit-Limit"] = String(this.limit)),
                this.remaining !== void 0 && (t["X-RateLimit-Remaining"] = String(this.remaining)),
                this.resetTime && (t["X-RateLimit-Reset"] = String(this.resetTime)),
                new Response(JSON.stringify(this.toJSON()), { status: this.statusCode, headers: t })
            );
        }
        toJSON() {
            return {
                error: {
                    code: this.code,
                    message: this.message,
                    statusCode: this.statusCode,
                    ...(this.retryAfter && { retryAfter: this.retryAfter }),
                    ...(this.limit !== void 0 && { limit: this.limit }),
                    ...(this.remaining !== void 0 && { remaining: this.remaining }),
                    ...(this.resetTime && { resetTime: this.resetTime }),
                },
            };
        }
    },
    L = class extends p {
        query;
        originalError;
        constructor(t, r, e) {
            (super(t, "DATABASE_ERROR", 500, false), (this.query = r), (this.originalError = e));
        }
    },
    v = class extends p {
        key;
        constructor(t, r) {
            (super(t, "CACHE_ERROR", 500, false), (this.key = r));
        }
    },
    A = class extends p {
        key;
        constructor(t, r) {
            (super(t, "CONFIG_ERROR", 500, false), (this.key = r));
        }
    },
    m = class extends p {
        pluginName;
        constructor(t, r) {
            (super(t, "PLUGIN_ERROR", 500, false), (this.pluginName = r));
        }
    };
function S(s) {
    return s instanceof p;
}
function Z(s) {
    return S(s) ? s.isOperational : false;
}
function Y(s) {
    if (S(s)) return s.toResponse();
    let t = globalThis.ENVIRONMENT === "development",
        r = t && s instanceof Error ? s.message : "Internal Server Error";
    return new Response(
        JSON.stringify({
            error: {
                code: "INTERNAL_ERROR",
                message: r,
                statusCode: 500,
                ...(t && s instanceof Error && { stack: s.stack }),
            },
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
    );
}
function M() {
    let s = new Map(),
        t = new Map();
    return {
        async get(r) {
            let e = s.get(r);
            return e ? (Date.now() > e.resetAt ? (s.delete(r), null) : e) : null;
        },
        async set(r, e, n) {
            s.set(r, e);
            let i = t.get(r);
            i && clearTimeout(i);
            let o = setTimeout(() => {
                (s.delete(r), t.delete(r));
            }, n * 1e3);
            t.set(r, o);
        },
        async increment(r) {
            let e = s.get(r);
            return e ? (Date.now() > e.resetAt ? (s.delete(r), null) : (e.count++, s.set(r, e), e)) : null;
        },
        async reset(r) {
            s.delete(r);
            let e = t.get(r);
            e && (clearTimeout(e), t.delete(r));
        },
    };
}
function H(s) {
    let t = s.prefix ?? "ratelimit:",
        r = s.binding;
    function e(n) {
        return `${t}${n}`;
    }
    return {
        async get(n) {
            let i = await r.get(e(n), "json");
            if (!i) return null;
            let o = i;
            return Date.now() > o.resetAt ? (await r.delete(e(n)), null) : o;
        },
        async set(n, i, o) {
            await r.put(e(n), JSON.stringify(i), { expirationTtl: o });
        },
        async increment(n) {
            let i = e(n),
                o = await r.get(i, "json");
            if (!o) return null;
            if (Date.now() > o.resetAt) return (await r.delete(i), null);
            o.count++;
            let a = Math.ceil((o.resetAt - Date.now()) / 1e3);
            return (await r.put(i, JSON.stringify(o), { expirationTtl: Math.max(a, 1) }), o);
        },
        async reset(n) {
            await r.delete(e(n));
        },
    };
}
function ee(s) {
    let { store: t, maxRequests: r = 100, windowSeconds: e = 60, keyGenerator: n = a, skip: i } = s,
        o = e * 1e3;
    function a(g) {
        return g.headers.get("CF-Connecting-IP") ?? "anonymous";
    }
    async function u(g) {
        let l = await t.get(g);
        return l ? (Date.now() > l.resetAt ? (await t.reset(g), null) : l) : null;
    }
    async function c(g) {
        let l = { count: 0, resetAt: Date.now() + o, limit: r, window: e };
        return (await t.set(g, l, e), l);
    }
    return {
        async check(g) {
            if (i?.(g)) return { allowed: true, limit: r, remaining: r, resetTime: Date.now() + o };
            let l = n(g),
                d = await u(l);
            if (!d) return { allowed: true, limit: r, remaining: r, resetTime: Date.now() + o };
            let f = Math.max(0, r - d.count),
                h = f > 0;
            return {
                allowed: h,
                limit: r,
                remaining: f,
                resetTime: d.resetAt,
                ...(!h && { retryAfter: Math.ceil((d.resetAt - Date.now()) / 1e3) }),
            };
        },
        async consume(g) {
            if (i?.(g)) return { allowed: true, limit: r, remaining: r, resetTime: Date.now() + o };
            let l = n(g),
                d = await u(l);
            d || (d = await c(l));
            let f = await t.increment(l);
            f ? (d.count = f.count) : ((d = await c(l)), await t.increment(l), (d.count = 1));
            let h = Math.max(0, r - d.count);
            if (!(d.count <= r)) {
                let $ = Math.ceil((d.resetAt - Date.now()) / 1e3);
                throw new w(s.message ?? "Too many requests", $, r, 0, Math.floor(d.resetAt / 1e3));
            }
            return { allowed: true, limit: r, remaining: h, resetTime: d.resetAt };
        },
        async reset(g) {
            await t.reset(g);
        },
        async status(g) {
            return this.check(g);
        },
    };
}
var x = class {
        plugins = new Map();
        hooks = new Map();
        installedOrder = [];
        register(t, r = {}) {
            if (this.plugins.has(t.name)) throw new m(`Plugin "${t.name}" is already registered`, t.name);
            if (t.dependencies) {
                for (let e of t.dependencies)
                    if (!this.plugins.has(e))
                        throw new m(`Plugin "${t.name}" requires "${e}" which is not registered`, t.name);
            }
            if (
                (this.plugins.set(t.name, {
                    plugin: t,
                    options: { enabled: true, priority: 100, ...r },
                    installed: false,
                }),
                t.hooks)
            )
                for (let [e, n] of Object.entries(t.hooks)) n && this.on(e, n);
        }
        unregister(t) {
            let r = this.plugins.get(t);
            if (!r) throw new m(`Plugin "${t}" is not registered`, t);
            if (r.installed) throw new m(`Cannot unregister installed plugin "${t}". Shutdown the app first.`, t);
            for (let [e, n] of this.plugins)
                if (n.plugin.dependencies?.includes(t))
                    throw new m(`Cannot unregister "${t}" because "${e}" depends on it`, t);
            this.plugins.delete(t);
        }
        async installAll(t) {
            let r = this.getSortedPlugins();
            for (let e of r)
                if (e.options.enabled && !e.installed)
                    try {
                        (await e.plugin.install(t),
                            (e.installed = !0),
                            this.installedOrder.push(e.plugin.name),
                            t.logger.debug(`Plugin "${e.plugin.name}" installed successfully`));
                    } catch (n) {
                        throw (
                            (e.error = n instanceof Error ? n : new Error(String(n))),
                            new m(`Failed to install plugin "${e.plugin.name}": ${e.error.message}`, e.plugin.name)
                        );
                    }
        }
        getSortedPlugins() {
            return Array.from(this.plugins.values()).sort((r, e) => {
                let n = (r.options.priority ?? 100) - (e.options.priority ?? 100);
                return n !== 0
                    ? n
                    : r.plugin.dependencies?.includes(e.plugin.name)
                      ? 1
                      : e.plugin.dependencies?.includes(r.plugin.name)
                        ? -1
                        : 0;
            });
        }
        on(t, r) {
            (this.hooks.has(t) || this.hooks.set(t, new Set()), this.hooks.get(t).add(r));
        }
        off(t, r) {
            this.hooks.get(t)?.delete(r);
        }
        async emit(t, ...r) {
            let e = this.hooks.get(t);
            if (e)
                for (let n of e)
                    try {
                        await n(...r);
                    } catch (i) {
                        console.error(`Hook handler for "${t}" failed:`, i);
                    }
        }
        get(t) {
            return this.plugins.get(t)?.plugin;
        }
        has(t) {
            return this.plugins.has(t);
        }
        isInstalled(t) {
            return this.plugins.get(t)?.installed ?? false;
        }
        get names() {
            return Array.from(this.plugins.keys());
        }
        get installedNames() {
            return this.installedOrder;
        }
        clear() {
            (this.plugins.clear(), this.hooks.clear(), (this.installedOrder = []));
        }
    },
    I = new x();
function te(s) {
    return s;
}
function re(s) {
    return s;
}
function ne(s, t, ...r) {
    return {
        name: s,
        version: t,
        dependencies: r.flatMap((e) => e.dependencies || []),
        async install(e) {
            for (let n of r) await n.install(e);
        },
    };
}
export {
    P as AuthError,
    v as CacheError,
    p as CloudflareKitError,
    A as ConfigError,
    L as DatabaseError,
    E as HttpError,
    m as PluginError,
    x as PluginRegistry,
    w as RateLimitError,
    k as ValidationError,
    ne as composePlugins,
    K as corsMiddleware,
    q as createApp,
    F as createAuth,
    J as createCache,
    _ as createDatabase,
    H as createKVRateLimitStore,
    N as createLogger,
    M as createMemoryRateLimitStore,
    re as createPlugin,
    z as createQueue,
    G as createQueueConsumer,
    ee as createRateLimiter,
    Q as createStorage,
    te as definePlugin,
    y as errorResponse,
    I as globalRegistry,
    Y as handleError,
    S as isCloudflareKitError,
    Z as isOperationalError,
    V as jsonMiddleware,
    b as jsonResponse,
    W as rateLimit,
    j as redirectResponse,
    B as securityHeadersMiddleware,
    U as successResponse,
    X as validateRequest,
}; //# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map
