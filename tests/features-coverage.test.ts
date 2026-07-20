import { describe, it, expect } from "vitest";
import { createApp, jsonResponse, createOpenAPI, defineRoute } from "../src/index";
import { createTestApp, createMockKV, createMockD1, createMockR2, mockRequest, mockEnv, expectJSON, expectStatus } from "../src/testing/index";
import { HttpError, ValidationError, CacheError, DatabaseError } from "../src/errors/index";
import { rateLimit, validateRequest } from "../src/security/index";
import { createDatabase } from "../src/database/index";
import { createStorage } from "../src/storage/index";

async function streamToText(stream: ReadableStream | null | undefined): Promise<string> {
    if (!stream) return "";
    return new Response(stream).text();
}

describe("OpenAPI", () => {
    it("generates specs from defineRoute metadata and serves docs", async () => {
        const openapi = createOpenAPI({
            title: "Demo API",
            version: "1.0.0",
            description: "test",
            servers: [{ url: "https://api.example.com" }],
        });
        const app = createApp();
        openapi.attach(app);
        app.use(openapi.serve());

        app.get(
            "/users/:id",
            defineRoute({
                summary: "Get user",
                tags: ["Users"],
                responses: { "200": { description: "ok" } },
            }),
            (ctx) => jsonResponse({ id: ctx.params.id }),
        );

        const spec = openapi.generate();
        expect(spec.openapi).toBe("3.0.3");
        expect(spec.info.title).toBe("Demo API");
        expect(spec.paths["/users/{id}"].get.summary).toBe("Get user");

        const testApp = createTestApp(app);
        const json = await testApp.get("/openapi.json");
        expect(json.status).toBe(200);
        expect((await json.json<{ info: { title: string } }>()).info.title).toBe("Demo API");

        const docs = await testApp.get("/docs");
        expect(docs.status).toBe(200);
        expect(docs.headers.get("Content-Type")).toContain("text/html");
        expect(docs.body).toContain("swagger-ui");
    });
});

describe("errors", () => {
    it("exposes HTTP helpers and serializes to responses", async () => {
        expect(HttpError.badRequest().statusCode).toBe(400);
        expect(HttpError.unauthorized().statusCode).toBe(401);
        expect(HttpError.notFound().statusCode).toBe(404);
        expect(new ValidationError("bad").statusCode).toBe(400);

        const res = HttpError.forbidden("nope").toResponse();
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body).toMatchObject({ error: { message: "nope", statusCode: 403 } });

        expect(new CacheError("fail", "k").message).toBe("fail");
        expect(new DatabaseError("fail").message).toBe("fail");
    });
});

describe("security helpers", () => {
    it("rateLimit returns 429 after exceeding maxRequests", async () => {
        const app = createApp();
        app.use(rateLimit({ maxRequests: 2, windowSeconds: 60, keyGenerator: () => "ip" }));
        app.get("/", () => jsonResponse({ ok: true }));
        const testApp = createTestApp(app);

        expect((await testApp.get("/")).status).toBe(200);
        expect((await testApp.get("/")).status).toBe(200);
        const limited = await testApp.get("/");
        expect(limited.status).toBe(429);
        expect(limited.headers.get("Retry-After")).toBeTruthy();
        expect(limited.headers.get("X-RateLimit-Limit")).toBe("2");
    });

    it("validateRequest enforces required fields", async () => {
        const app = createApp();
        app.use(async (ctx) => {
            ctx.state.body = {};
        });
        app.use(validateRequest({ email: { type: "email", required: true } }));
        app.post("/x", () => jsonResponse({ ok: true }));

        const res = await createTestApp(app).post("/x");
        expect(res.status).toBe(400);
    });
});

describe("database service", () => {
    it("inserts and queries via mock D1", async () => {
        const d1 = createMockD1();
        d1._insert("users", { id: 1, name: "Ada" });
        const db = createDatabase({ binding: d1 as never });

        const row = await db.get<{ id: number; name: string }>("SELECT * FROM users WHERE id = ?", [1]);
        expect(row).toEqual({ id: "1", name: "Ada" });

        const all = await db.query("SELECT * FROM users");
        expect(all.results.length).toBe(1);

        const id = await db.insert("users", { name: "Grace" });
        expect(id).toBeTruthy();
    });
});

describe("storage service", () => {
    it("uploads and downloads objects via mock R2", async () => {
        const bucket = createMockR2();
        const storage = createStorage({
            binding: bucket as never,
            signingSecret: "test-signing-secret-16",
        });

        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode("hello-file"));
                controller.close();
            },
        });

        const uploaded = await storage.uploadStream("docs/a.txt", stream, { contentType: "text/plain" });
        expect(uploaded.key).toBe("docs/a.txt");

        const downloaded = await storage.download("docs/a.txt");
        expect(await streamToText(downloaded.data)).toBe("hello-file");

        await storage.delete("docs/a.txt");
        await expect(storage.download("docs/a.txt")).rejects.toThrow();
    });
});

describe("testing helpers", () => {
    it("mockRequest / mockEnv / expect helpers work", async () => {
        const env = mockEnv({ JWT_SECRET: "x".repeat(32) });
        await env.KV.put("k", "v");
        expect(await env.KV.get("k")).toBe("v");
        expect(env.DB).toBeTruthy();
        expect(env.BUCKET).toBeTruthy();

        const req = mockRequest("POST", "/items", { json: { a: 1 }, params: { q: "1" } });
        expect(req.method).toBe("POST");
        expect(new URL(req.url).searchParams.get("q")).toBe("1");

        const kv = createMockKV();
        const d1 = createMockD1();
        const r2 = createMockR2();
        expect(kv._calls).toEqual([]);
        expect(d1._calls).toEqual([]);
        expect(r2._calls).toEqual([]);

        const app = createApp();
        app.get("/ok", () => jsonResponse({ hello: "world" }));
        const res = await createTestApp(app).get("/ok");
        expectStatus(res, 200);
        await expectJSON(res, { hello: "world" });
    });
});
