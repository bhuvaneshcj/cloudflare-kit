import { describe, it, expect, vi, afterEach } from "vitest";
import { createLogger, createApp, jsonResponse } from "../src/index";
import { createTestApp } from "../src/testing/index";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("createLogger", () => {
    it("respects log level filtering", () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const error = vi.spyOn(console, "error").mockImplementation(() => {});

        const logger = createLogger({ level: "warn", service: "api", environment: "test" });
        logger.debug("skip");
        logger.info("skip");
        logger.warn("careful", { code: 1 });
        logger.error("failed");

        expect(log).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledOnce();
        expect(error).toHaveBeenCalledOnce();

        const warnEntry = JSON.parse(String(warn.mock.calls[0][0]));
        expect(warnEntry.level).toBe("WARN");
        expect(warnEntry.service).toBe("api");
        expect(warnEntry.data).toEqual({ code: 1 });
    });

    it("child logger merges context", () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        const logger = createLogger({ level: "info" }).child({ requestId: "r1" });
        logger.info("hello", { path: "/" });

        const entry = JSON.parse(String(log.mock.calls[0][0]));
        expect(entry.data).toMatchObject({ requestId: "r1", path: "/" });
    });

    it("requestLogger middleware sets requestId on state", async () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        const logger = createLogger({ level: "info", service: "api" });
        const app = createApp();
        app.use(logger.requestLogger());
        app.get("/ping", (ctx) => jsonResponse({ requestId: ctx.state.requestId }));

        const testApp = createTestApp(app);
        const res = await testApp.get("/ping");
        const body = await res.json<{ requestId: string }>();
        expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        expect(log).toHaveBeenCalled();
    });
});
