import { describe, it, expect, vi } from "vitest";
import { createQueue, createQueueConsumer } from "../src/queue/index";

function createMockQueueBinding() {
    const sent: unknown[] = [];
    const batches: unknown[] = [];
    return {
        sent,
        batches,
        binding: {
            async send(body: unknown, options?: { delaySeconds?: number }) {
                sent.push({ body, options });
            },
            async sendBatch(messages: unknown[]) {
                batches.push(messages);
            },
        },
    };
}

describe("createQueue", () => {
    it("sends single messages and batches", async () => {
        const mock = createMockQueueBinding();
        const queue = createQueue({ binding: mock.binding as never });

        const ok = await queue.send({ type: "email" }, { delaySeconds: 5 });
        expect(ok.success).toBe(true);
        expect(mock.sent[0]).toEqual({ body: { type: "email" }, options: { delaySeconds: 5 } });

        const batch = await queue.sendBatch([{ type: "a" }, { body: { type: "b" }, delaySeconds: 10 }]);
        expect(batch.success).toBe(true);
        expect(mock.batches[0]).toEqual([{ body: { type: "a" } }, { body: { type: "b" }, delaySeconds: 10 }]);
    });

    it("sendOrThrow surfaces binding failures", async () => {
        const queue = createQueue({
            binding: {
                async send() {
                    throw new Error("queue down");
                },
                async sendBatch() {},
            } as never,
        });

        await expect(queue.sendOrThrow({ x: 1 })).rejects.toThrow("queue down");
        const soft = await queue.send({ x: 1 });
        expect(soft.success).toBe(false);
        expect(soft.error).toContain("queue down");
    });
});

describe("createQueueConsumer", () => {
    it("acks successful messages and retries failures", async () => {
        const processed: unknown[] = [];
        const consumer = createQueueConsumer<{ n: number }>(async (message) => {
            processed.push(message.body);
            if (message.body.n === 2) throw new Error("boom");
        });

        const ack = vi.fn();
        const retry = vi.fn();
        const ack2 = vi.fn();
        const retry2 = vi.fn();

        await consumer(
            {
                queue: "jobs",
                messages: [
                    {
                        id: "1",
                        body: { n: 1 },
                        timestamp: new Date("2026-01-01"),
                        attempts: 1,
                        ack,
                        retry,
                    },
                    {
                        id: "2",
                        body: { n: 2 },
                        timestamp: new Date("2026-01-01"),
                        attempts: 1,
                        ack: ack2,
                        retry: retry2,
                    },
                ],
            },
            {},
            { waitUntil() {}, passThroughOnException() {} } as ExecutionContext,
        );

        expect(processed).toEqual([{ n: 1 }, { n: 2 }]);
        expect(ack).toHaveBeenCalledOnce();
        expect(retry).not.toHaveBeenCalled();
        expect(ack2).not.toHaveBeenCalled();
        expect(retry2).toHaveBeenCalledOnce();
    });

    it("passes QueueMessage metadata to the processor", async () => {
        let seen: { id: string; attempts: number; timestamp: number } | undefined;
        const consumer = createQueueConsumer(async (message) => {
            seen = { id: message.id, attempts: message.attempts, timestamp: message.timestamp };
        });

        await consumer(
            {
                queue: "jobs",
                messages: [
                    {
                        id: "msg-9",
                        body: { ok: true },
                        timestamp: new Date("2026-07-20T00:00:00.000Z"),
                        attempts: 3,
                        ack() {},
                        retry() {},
                    },
                ],
            },
            {},
            { waitUntil() {}, passThroughOnException() {} } as ExecutionContext,
        );

        expect(seen).toEqual({
            id: "msg-9",
            attempts: 3,
            timestamp: Date.parse("2026-07-20T00:00:00.000Z"),
        });
    });
});
