import { describe, it, expect } from "vitest";
import { createApp, parseRoutePattern } from "../src/core/app";
import { jsonResponse } from "../src/core/response";
import { createTestApp } from "../src/testing/index";

describe("parseRoutePattern", () => {
    it("extracts :id params", () => {
        const { pattern, paramNames } = parseRoutePattern("/users/:id");
        expect(paramNames).toEqual(["id"]);
        const match = "/users/123".match(pattern);
        expect(match).not.toBeNull();
        expect(match![1]).toBe("123");
    });

    it("extracts nested params", () => {
        const { pattern, paramNames } = parseRoutePattern("/posts/:slug/comments/:commentId");
        expect(paramNames).toEqual(["slug", "commentId"]);
        const match = "/posts/hello/comments/9".match(pattern);
        expect(match![1]).toBe("hello");
        expect(match![2]).toBe("9");
    });

    it("captures wildcard splat", () => {
        const { pattern, paramNames, isWildcard } = parseRoutePattern("/static/*");
        expect(isWildcard).toBe(true);
        expect(paramNames).toEqual([]);
        const match = "/static/a/b.css".match(pattern);
        expect(match).not.toBeNull();
        expect(match![1]).toBe("a/b.css");
    });
});

describe("createApp routing", () => {
    it("matches dynamic routes and exposes params", async () => {
        const app = createApp();
        app.get("/users/:id", (ctx) => jsonResponse({ id: ctx.params.id }));

        const testApp = createTestApp(app);
        const res = await testApp.get("/users/42");
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ id: "42" });
    });

    it("sets params['*'] for wildcards", async () => {
        const app = createApp();
        app.get("/static/*", (ctx) => jsonResponse({ splat: ctx.params["*"] }));

        const testApp = createTestApp(app);
        const res = await testApp.get("/static/css/app.css");
        expect(await res.json()).toEqual({ splat: "css/app.css" });
    });

    it("returns 405 with Allow header", async () => {
        const app = createApp();
        app.get("/items", () => jsonResponse({ ok: true }));

        const testApp = createTestApp(app);
        const res = await testApp.post("/items");
        expect(res.status).toBe(405);
        expect(res.headers.get("Allow")).toContain("GET");
    });

    it("runs multi-middleware route handlers", async () => {
        const app = createApp();
        const order: string[] = [];

        app.post(
            "/x",
            async (ctx) => {
                order.push("mw1");
                ctx.state.a = 1;
            },
            async (ctx) => {
                order.push("mw2");
                ctx.state.b = 2;
            },
            (ctx) => jsonResponse({ a: ctx.state.a, b: ctx.state.b, order }),
        );

        const testApp = createTestApp(app);
        const res = await testApp.post("/x", { json: {} });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ a: 1, b: 2, order: ["mw1", "mw2"] });
    });

    it("applies group middleware registered before routes", async () => {
        const app = createApp();
        app.group("/api", (router) => {
            router.use(async (ctx) => {
                ctx.state.authed = true;
            });
            router.get("/me", (ctx) => jsonResponse({ authed: ctx.state.authed === true }));
        });

        const testApp = createTestApp(app);
        const res = await testApp.get("/api/me");
        expect(await res.json()).toEqual({ authed: true });
    });
});
