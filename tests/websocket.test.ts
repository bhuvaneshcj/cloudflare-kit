import { describe, it, expect, vi } from "vitest";
import { createApp, jsonResponse, createWebSocketHandler, createDurableWebSocket, asHandler } from "../src/index";
import { createTestApp, createMockExecutionContext } from "../src/testing/index";
import type { DurableObjectState, DurableObjectStorage } from "@cloudflare/workers-types";

describe("WebSocket helpers", () => {
    it("rejects non-upgrade requests with 426", async () => {
        const ws = createWebSocketHandler({});
        const res = await ws.fetch(new Request("https://example.com/ws"), {}, createMockExecutionContext());
        expect(res.status).toBe(426);
        expect(await res.json()).toEqual({ error: "Expected Upgrade: websocket header" });
    });

    it("asHandler adapts websocket fetch into an app route", async () => {
        const stub = {
            async fetch() {
                return jsonResponse({ upgraded: false }, 426);
            },
        };
        const app = createApp();
        app.get("/ws", asHandler(stub));

        const res = await createTestApp(app).get("/ws");
        expect(res.status).toBe(426);
        expect(await res.json()).toEqual({ upgraded: false });
    });

    it("durable websocket rejects missing Upgrade and forwards hibernation callbacks", async () => {
        const onMessage = vi.fn(async () => {});
        const onClose = vi.fn(async () => {});
        const onError = vi.fn(async () => {});

        const storage = {
            get: async () => undefined,
            put: async () => {},
            delete: async () => true,
            deleteAll: async () => {},
            list: async () => new Map(),
            transaction: async (fn: (txn: unknown) => Promise<unknown>) => fn({}),
            getAlarm: async () => null,
            setAlarm: async () => {},
            deleteAlarm: async () => {},
            sync: async () => {},
            sql: {} as never,
            kv: {} as never,
            transactionSync: <T>(fn: () => T) => fn(),
            getCurrentBookmark: async () => "",
            getBookmarkForTime: async () => "",
            onNextSessionRestoreBookmark: async () => "",
        } as unknown as DurableObjectStorage;

        const durableState = {
            storage,
            acceptWebSocket: vi.fn(),
            getWebSockets: () => [],
            setWebSocketAutoResponse: () => {},
            getWebSocketAutoResponse: () => null,
            getWebSocketAutoResponseTimestamp: () => null,
            setHibernatableWebSocketEventTimeout: () => {},
            getHibernatableWebSocketEventTimeout: () => null,
            getTags: () => [],
            waitUntil: () => {},
            blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(),
            id: { toString: () => "do-1", equals: () => false } as never,
            props: undefined,
            exports: {} as never,
            facets: {} as never,
            abort: () => {},
        } as unknown as DurableObjectState;

        const ws = createDurableWebSocket({ onMessage, onClose, onError });
        const rejected = await ws.fetch(new Request("https://example.com/ws"), {}, durableState);
        expect(rejected.status).toBe(426);

        const fakeSocket = {} as WebSocket;
        await ws.webSocketMessage(fakeSocket, "hi", {}, durableState);
        await ws.webSocketClose(fakeSocket, 1000, "bye", {}, durableState);
        await ws.webSocketError(fakeSocket, new Error("x"), {}, durableState);

        expect(onMessage).toHaveBeenCalledOnce();
        expect(onClose).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledOnce();
    });
});
