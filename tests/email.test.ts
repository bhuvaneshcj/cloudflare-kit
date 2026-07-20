import { describe, it, expect, vi, afterEach } from "vitest";
import { createMailer } from "../src/email/index";
import type { SendEmail } from "../src/email/index";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("createMailer", () => {
    it("sends via Cloudflare Email Service binding", async () => {
        const send = vi.fn(async () => ({ messageId: "msg-1" }));
        const binding = { send } as unknown as SendEmail;
        const mailer = createMailer({
            from: { email: "noreply@example.com", name: "App" },
            binding,
        });

        const result = await mailer.send({
            to: { email: "user@example.com", name: "User" },
            subject: "Hello",
            text: "Hi",
            html: "<p>Hi</p>",
            cc: { email: "cc@example.com" },
            replyTo: { email: "support@example.com" },
            headers: { "X-Custom": "1" },
        });

        expect(result.success).toBe(true);
        expect(result.messageId).toBe("msg-1");
        expect(send).toHaveBeenCalledOnce();
        const payload = send.mock.calls[0][0] as Record<string, unknown>;
        expect(payload.subject).toBe("Hello");
        expect(payload.from).toEqual({ email: "noreply@example.com", name: "App" });
        expect(payload.to).toEqual({ email: "user@example.com", name: "User" });
        expect(payload.text).toBe("Hi");
        expect(payload.html).toBe("<p>Hi</p>");
    });

    it("sendTemplate interpolates and HTML-escapes values", async () => {
        const send = vi.fn(async () => ({ messageId: "t1" }));
        const mailer = createMailer({
            from: { email: "noreply@example.com" },
            binding: { send } as unknown as SendEmail,
        });

        mailer.registerTemplate("welcome", "<h1>Hello {{ name }}</h1>");
        await mailer.sendTemplate("welcome", { name: "<script>" }, { email: "u@example.com" }, "Welcome");

        const payload = send.mock.calls[0][0] as { html?: string; text?: string; subject?: string };
        expect(payload.subject).toBe("Welcome");
        expect(payload.html).toBe("<h1>Hello &lt;script&gt;</h1>");
        expect(payload.text).toContain("Hello &lt;script&gt;");
    });

    it("falls back to MailChannels with deprecation warning", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));

        const mailer = createMailer({ from: { email: "noreply@example.com", name: "App" } });
        const result = await mailer.send({
            to: { email: "user@example.com" },
            subject: "Hi",
            text: "body",
        });

        expect(result.success).toBe(true);
        expect(warn).toHaveBeenCalled();
        expect(String(warn.mock.calls[0][0])).toContain("MailChannels");
        expect(fetchMock).toHaveBeenCalledWith("https://api.mailchannels.net/tx/v1/send", expect.objectContaining({ method: "POST" }));
    });

    it("throws when MailChannels returns an error", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));

        const mailer = createMailer({ from: { email: "noreply@example.com" } });
        await expect(mailer.send({ to: { email: "user@example.com" }, subject: "Hi", text: "x" })).rejects.toThrow(/MailChannels/);
    });
});
