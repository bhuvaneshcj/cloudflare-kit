import { describe, it, expect } from "vitest";
import { createApp, createAuth, requireAuth, jsonResponse } from "../src/index";
import { createTestApp } from "../src/testing/index";

const SECRET = "a".repeat(32);

describe("auth", () => {
    it("creates and verifies tokens (Bearer and raw)", async () => {
        const auth = createAuth({ secret: SECRET, expiresIn: 3600 });
        const created = await auth.createToken({ id: "u1", email: "u@example.com", role: "admin" });
        expect(created.success).toBe(true);
        expect(created.token).toBeTruthy();

        const viaBearer = await auth.verifyToken(`Bearer ${created.token}`);
        expect(viaBearer.success).toBe(true);
        expect(viaBearer.user?.id).toBe("u1");

        const viaRaw = await auth.verifyToken(created.token!);
        expect(viaRaw.success).toBe(true);
    });

    it("rejects invalid algorithm / missing exp is always set on create", async () => {
        const auth = createAuth({ jwtSecret: SECRET });
        const created = await auth.createToken({ id: "u1", email: "u@example.com" });
        const parts = created.token!.split(".");
        // Tamper header alg
        const badHeader = btoa(JSON.stringify({ alg: "none", typ: "JWT" }))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");
        const bad = `${badHeader}.${parts[1]}.${parts[2]}`;
        const result = await auth.verifyToken(bad);
        expect(result.success).toBe(false);
    });

    it("requireAuth returns 401 without token", async () => {
        const auth = createAuth({ secret: SECRET });
        const app = createApp();
        app.get("/me", requireAuth(auth), (ctx) => jsonResponse({ user: ctx.state.user }));

        const testApp = createTestApp(app);
        const res = await testApp.get("/me");
        expect(res.status).toBe(401);
    });

    it("requireAuth attaches user with valid token", async () => {
        const auth = createAuth({ secret: SECRET });
        const { token } = await auth.createToken({ id: "u1", email: "u@example.com" });

        const app = createApp();
        app.get("/me", requireAuth(auth), (ctx) => jsonResponse({ user: ctx.state.user }));

        const testApp = createTestApp(app);
        const res = await testApp.get("/me", {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ user: { id: "u1", email: "u@example.com" } });
    });
});
