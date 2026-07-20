import { describe, it, expect, vi } from "vitest";
import { createApp, jsonResponse, definePlugin, composePlugins } from "../src/index";
import { createTestApp } from "../src/testing/index";

describe("plugins", () => {
    it("installs plugins and emits request:start hooks", async () => {
        const seen: string[] = [];
        const plugin = definePlugin({
            name: "tracker",
            version: "1.0.0",
            install() {
                seen.push("install");
            },
            hooks: {
                "request:start": (ctx) => {
                    (ctx as { state: Record<string, unknown> }).state.tracked = true;
                    seen.push("start");
                },
            },
        });

        const app = createApp({ plugins: [plugin] });
        app.get("/", (ctx) => jsonResponse({ tracked: Boolean(ctx.state.tracked) }));

        const testApp = createTestApp(app);
        const res = await testApp.get("/");
        expect(await res.json()).toEqual({ tracked: true });
        expect(seen).toEqual(["install", "start"]);
    });

    it("composePlugins merges install and hooks", async () => {
        const order: string[] = [];
        const a = definePlugin({
            name: "a",
            version: "1",
            install() {
                order.push("install-a");
            },
            hooks: {
                "request:start": () => {
                    order.push("hook-a");
                },
            },
        });
        const b = definePlugin({
            name: "b",
            version: "1",
            install() {
                order.push("install-b");
            },
            hooks: {
                "request:start": () => {
                    order.push("hook-b");
                },
            },
        });

        const composed = composePlugins("bundle", "1.0.0", a, b);
        const app = createApp({ plugins: [composed] });
        app.get("/", () => jsonResponse({ ok: true }));

        await createTestApp(app).get("/");
        expect(order).toEqual(["install-a", "install-b", "hook-a", "hook-b"]);
    });

    it("onError can return a custom response", async () => {
        const onError = vi.fn(async () => jsonResponse({ handled: true }, 418));
        const app = createApp({ onError });
        app.get("/boom", () => {
            throw new Error("explode");
        });

        const res = await createTestApp(app).get("/boom");
        expect(res.status).toBe(418);
        expect(await res.json()).toEqual({ handled: true });
        expect(onError).toHaveBeenCalledOnce();
    });
});
