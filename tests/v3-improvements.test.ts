import { describe, it, expect } from "vitest";
import { v, createValidator } from "../src/validation/index";
import { createApp, jsonResponse } from "../src/index";
import { createTestApp } from "../src/testing/index";
import { buildWhereClause } from "../src/database/index";
import { createRateLimiter, createMemoryRateLimitStore, createRateLimitMiddleware } from "../src/security/rate-limiter/index";
import { defineRoute, createOpenAPI } from "../src/openapi/index";
import { requireAuth, createAuth } from "../src/auth/index";

describe("validation 3.0", () => {
    it("supports regex and enum", () => {
        expect(v.string().regex(/^[a-z]+$/).parse("abc").success).toBe(true);
        expect(v.string().regex(/^[a-z]+$/).parse("ABC").success).toBe(false);
        expect(v.string().enum(["a", "b"]).parse("a").success).toBe(true);
        expect(v.string().enum(["a", "b"]).parse("c").success).toBe(false);
    });

    it("supports nullable and default", () => {
        expect(v.string().nullable().parse(null).success).toBe(true);
        const withDefault = v.string().default("x");
        expect(withDefault.parse(undefined).data).toBe("x");
    });

    it("does not coerce query by default", async () => {
        const app = createApp();
        app.get(
            "/q",
            createValidator({
                query: v.object({ limit: v.string() }),
            }),
            (ctx) => jsonResponse({ limit: (ctx as { validatedQuery?: { limit: string } }).validatedQuery?.limit }),
        );
        const testApp = createTestApp(app);
        const res = await testApp.get("/q?limit=10");
        expect(res.status).toBe(200);
    });
});

describe("database where ops", () => {
    it("supports neq and in and isNull", () => {
        const { clause, params } = buildWhereClause({
            status: { op: "neq", value: "deleted" },
            id: { op: "in", value: [1, 2] },
            archived: { op: "isNull" },
        });
        expect(clause).toContain("status != ?");
        expect(clause).toContain("id IN (?, ?)");
        expect(clause).toContain("archived IS NULL");
        expect(params).toEqual(["deleted", 1, 2]);
    });
});

describe("rate limit middleware headers", () => {
    it("sets rate limit headers on success", async () => {
        const limiter = createRateLimiter({
            store: createMemoryRateLimitStore(),
            maxRequests: 5,
            windowSeconds: 60,
        });
        const app = createApp();
        app.use(createRateLimitMiddleware(limiter));
        app.get("/ok", () => jsonResponse({ ok: true }));
        const testApp = createTestApp(app);
        const res = await testApp.get("/ok");
        expect(res.status).toBe(200);
        expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    });
});

describe("openapi attach preserves middleware", () => {
    it("keeps requireAuth after attach", async () => {
        const auth = createAuth({ secret: "a".repeat(32) });
        const app = createApp();
        const openapi = createOpenAPI({ info: { title: "t", version: "1" } });
        openapi.attach(app);

        app.get("/secure", defineRoute({ summary: "secure" }), requireAuth(auth), (ctx) =>
            jsonResponse({ user: ctx.state.user }),
        );

        const testApp = createTestApp(app);
        const denied = await testApp.get("/secure");
        expect(denied.status).toBe(401);

        const { token } = await auth.createToken({ id: "1", email: "a@b.com" });
        const ok = await testApp.get("/secure", { headers: { Authorization: `Bearer ${token}` } });
        expect(ok.status).toBe(200);
    });
});

describe("trailingSlash", () => {
    it("ignores trailing slash when configured", async () => {
        const app = createApp({ trailingSlash: "ignore" });
        app.get("/users", () => jsonResponse({ ok: true }));
        const testApp = createTestApp(app);
        const res = await testApp.get("/users/");
        expect(res.status).toBe(200);
    });
});

describe("response helpers", () => {
    it("supports headers and structured errors", async () => {
        const { jsonResponse, errorResponse, successResponse } = await import("../src/core/response");
        const j = jsonResponse({ a: 1 }, 201, { "X-Test": "1" });
        expect(j.status).toBe(201);
        expect(j.headers.get("X-Test")).toBe("1");
        const e = errorResponse("bad", 400, [{ field: "x" }]);
        expect(await e.json()).toEqual({ error: "bad", details: [{ field: "x" }] });
        const s = successResponse({ id: 1 });
        expect(await s.json()).toEqual({ success: true, id: 1 });
    });
});
