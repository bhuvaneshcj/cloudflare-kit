import { describe, it, expect } from "vitest";
import { createSSE, streamJSON, createStreamResponse, createTextStream, createNDJSONStream, pipeStream } from "../src/streaming/index";

describe("streaming / SSE", () => {
    it("createSSE formats events and supports ping/close", async () => {
        const sse = createSSE();
        expect(sse.response.headers.get("Content-Type")).toBe("text/event-stream");

        // Start reading before writing to avoid TransformStream backpressure deadlock
        const textPromise = sse.response.text();
        await sse.send({ event: "message", id: "1", data: { hello: "world" }, retry: 1000 });
        await sse.ping();
        await sse.close();

        const text = await textPromise;
        expect(text).toContain("event: message");
        expect(text).toContain("id: 1");
        expect(text).toContain('data: {"hello":"world"}');
        expect(text).toContain("retry: 1000");
        expect(text).toContain(": ping");
    });

    it("streamJSON wraps NDJSON responses", async () => {
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('{"n":1}\n'));
                controller.close();
            },
        });
        const res = streamJSON(stream);
        expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");
        expect(await res.text()).toContain('{"n":1}');
    });

    it("createStreamResponse writer writes JSON and text", async () => {
        const res = createStreamResponse(async (writer) => {
            await writer.writeJSON({ a: 1 });
            await writer.write("done");
            await writer.close();
        });
        const body = await res.text();
        expect(body).toContain('{"a":1}');
        expect(body).toContain("done");
    });

    it("createTextStream and createNDJSONStream return Responses", async () => {
        const text = createTextStream(async (writer) => {
            await writer.write("hello");
            await writer.close();
        });
        expect(await text.text()).toBe("hello");

        const ndjson = createNDJSONStream(async (writer) => {
            await writer.writeJSON({ id: 1 });
            await writer.close();
        });
        expect(await ndjson.text()).toContain('{"id":1}');
    });

    it("pipeStream pipes chunks into a Response", async () => {
        const source = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode("abc"));
                controller.close();
            },
        });
        const res = pipeStream(source, "text/plain");
        expect(res.headers.get("Content-Type")).toBe("text/plain");
        expect(await res.text()).toBe("abc");
    });
});
