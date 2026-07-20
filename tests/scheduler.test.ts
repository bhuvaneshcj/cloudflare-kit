import { describe, it, expect, vi } from "vitest";
import { createScheduler, createScheduledApp, createScheduledWorker, createApp, jsonResponse } from "../src/index";
import { createTestApp, createMockExecutionContext } from "../src/testing/index";

describe("createScheduler", () => {
    it("runs handlers matching the cron expression", async () => {
        const ran: string[] = [];
        const scheduler = createScheduler()
            .cron("0 * * * *", async () => {
                ran.push("hourly");
            })
            .cron("0 0 * * *", async () => {
                ran.push("daily");
            });

        await scheduler.scheduled({ cron: "0 * * * *", scheduledTime: Date.now(), type: "scheduled" }, {}, createMockExecutionContext());

        expect(ran).toEqual(["hourly"]);
    });

    it("isolates handler errors and continues", async () => {
        const warn = vi.spyOn(console, "error").mockImplementation(() => {});
        const ran: string[] = [];
        const scheduler = createScheduler()
            .cron("*/5 * * * *", async () => {
                throw new Error("fail");
            })
            .cron("*/5 * * * *", async () => {
                ran.push("ok");
            });

        await scheduler.scheduled({ cron: "*/5 * * * *", scheduledTime: Date.now(), type: "scheduled" }, {}, createMockExecutionContext());

        expect(ran).toEqual(["ok"]);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it("createScheduledApp exposes both fetch and scheduled", async () => {
        const app = createApp();
        app.get("/", () => jsonResponse({ ok: true }));
        const scheduler = createScheduler().cron("0 0 * * *", async () => {});
        const combined = createScheduledApp(app, scheduler);

        const res = await createTestApp(combined).get("/");
        expect(res.status).toBe(200);
        expect(typeof combined.scheduled).toBe("function");

        const worker = createScheduledWorker(scheduler);
        expect(typeof worker.scheduled).toBe("function");
    });
});
