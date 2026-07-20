import { describe, it, expect, vi } from "vitest";
import { createAnalytics } from "../src/analytics/index";
import { createAI } from "../src/ai/index";

describe("createAnalytics", () => {
    it("tracks events, counters, timings, and requests", () => {
        const points: Array<{ indexes?: string[]; doubles?: number[]; blobs?: string[] }> = [];
        const analytics = createAnalytics({
            binding: {
                writeDataPoint(data) {
                    points.push(data);
                },
            },
            dataset: "api",
        });

        analytics.track("signup", { plan: "pro", amount: 9.99, trial: true });
        analytics.increment("requests", 2);
        analytics.timing("db_ms", 12);
        analytics.trackRequest(new Request("https://example.com/api?x=1", { method: "POST", headers: { "user-agent": "vitest" } }), { route: "/api" });

        expect(points.length).toBeGreaterThanOrEqual(4);
        expect(points[0].indexes?.[0]).toBe("signup");
        expect(points[0].indexes).toContain("api");
        expect(points.some((p) => p.indexes?.[0] === "counter")).toBe(true);
        expect(points.some((p) => p.indexes?.[0] === "timing")).toBe(true);
        expect(points.some((p) => p.indexes?.[0] === "request")).toBe(true);
    });
});

describe("createAI", () => {
    it("text() and embed() use the Workers AI binding", async () => {
        const run = vi.fn(async (model: string, inputs: unknown) => {
            if (String(model).includes("bge")) {
                return { data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] };
            }
            return { response: `echo:${(inputs as { messages: Array<{ content: string }> }).messages[0].content}` };
        });

        const ai = createAI({ binding: { run } });
        expect(await ai.text("hello")).toBe("echo:hello");
        expect(await ai.embed(["a", "b"])).toEqual([
            [0.1, 0.2],
            [0.3, 0.4],
        ]);
        expect(run).toHaveBeenCalled();
    });

    it("passes gateway options through run()", async () => {
        const run = vi.fn(async () => ({ response: "ok" }));
        const ai = createAI({
            binding: { run },
            gateway: { id: "gw-1", cacheKey: "ck" },
        });

        await ai.run("@cf/meta/llama-3.1-8b-instruct", { prompt: "x" });
        expect(run.mock.calls[0][2]).toMatchObject({
            gateway: { id: "gw-1" },
            cacheKey: "ck",
        });
    });

    it("stream() requests streaming from the binding", async () => {
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode("chunk"));
                controller.close();
            },
        });
        const run = vi.fn(async () => stream);
        const ai = createAI({ binding: { run } });
        const result = await ai.stream("story");
        expect(result).toBe(stream);
        expect(run.mock.calls[0][2]).toMatchObject({ stream: true });
    });
});
