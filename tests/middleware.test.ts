import { describe, it, expect } from "vitest";
import { createApp, jsonResponse, corsMiddleware, jsonMiddleware, securityHeadersMiddleware } from "../src/index";
import { createTestApp } from "../src/testing/index";

describe("corsMiddleware", () => {
    it("handles preflight OPTIONS with configured headers", async () => {
        const app = createApp();
        app.use(
            corsMiddleware({
                origin: "https://app.example.com",
                methods: ["GET", "POST"],
                allowHeaders: ["Content-Type", "Authorization"],
                maxAge: 600,
                exposeHeaders: ["X-Request-Id"],
            }),
        );
        app.get("/", () => jsonResponse({ ok: true }));

        const testApp = createTestApp(app);
        const res = await testApp.request("OPTIONS", "/", {
            headers: { Origin: "https://app.example.com" },
        });

        expect(res.status).toBe(204);
        expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
        expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
        expect(res.headers.get("Access-Control-Max-Age")).toBe("600");
        expect(res.headers.get("Access-Control-Expose-Headers")).toBe("X-Request-Id");
    });

    it("reflects origin from allowlist", async () => {
        const app = createApp();
        app.use(corsMiddleware({ origin: ["https://a.example.com", "https://b.example.com"] }));
        app.get("/", () => jsonResponse({ ok: true }));

        const testApp = createTestApp(app);
        const res = await testApp.get("/", { headers: { Origin: "https://b.example.com" } });
        expect(res.status).toBe(200);
        expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://b.example.com");
    });
});

describe("jsonMiddleware", () => {
    it("parses JSON body into state.body", async () => {
        const app = createApp();
        app.use(jsonMiddleware());
        app.post("/echo", (ctx) => jsonResponse({ body: ctx.state.body }));

        const testApp = createTestApp(app);
        const res = await testApp.post("/echo", { json: { name: "Ada" } });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ body: { name: "Ada" } });
    });

    it("rejects invalid JSON with 400", async () => {
        const app = createApp();
        app.use(jsonMiddleware());
        app.post("/echo", () => jsonResponse({ ok: true }));

        const testApp = createTestApp(app);
        const res = await testApp.post("/echo", {
            body: "{bad",
            headers: { "Content-Type": "application/json" },
        });
        expect(res.status).toBe(400);
    });

    it("rejects oversized bodies with 413", async () => {
        const app = createApp();
        app.use(jsonMiddleware({ maxSize: 8 }));
        app.post("/echo", () => jsonResponse({ ok: true }));

        const testApp = createTestApp(app);
        const res = await testApp.post("/echo", {
            json: { huge: "payload-too-big" },
        });
        expect(res.status).toBe(413);
    });

    it("skips re-parse when state.body is already set", async () => {
        const app = createApp();
        app.use(async (ctx) => {
            ctx.state.body = { preset: true };
        });
        app.use(jsonMiddleware());
        app.post("/echo", (ctx) => jsonResponse({ body: ctx.state.body }));

        const testApp = createTestApp(app);
        const res = await testApp.post("/echo", { json: { ignored: true } });
        expect(await res.json()).toEqual({ body: { preset: true } });
    });
});

describe("securityHeadersMiddleware", () => {
    it("applies default security headers on responses", async () => {
        const app = createApp();
        app.use(securityHeadersMiddleware());
        app.get("/", () => jsonResponse({ ok: true }));

        const testApp = createTestApp(app);
        const res = await testApp.get("/");
        expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(res.headers.get("X-Frame-Options")).toBe("DENY");
        expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
        expect(res.headers.get("Content-Security-Policy")).toContain("default-src");
        expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
    });
});
