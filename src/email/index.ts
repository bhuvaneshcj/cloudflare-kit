/**
 * Email Module
 *
 * Prefer Cloudflare Email Service (`send_email` binding) with the structured
 * message builder. MailChannels HTTP fallback is deprecated.
 */

import type {
    EmailAddress as CfEmailAddress,
    EmailMessageBuilder,
    SendEmail,
} from "@cloudflare/workers-types";

export type { SendEmail, EmailMessageBuilder, EmailSendResult } from "@cloudflare/workers-types";

/**
 * Kit-facing address (name optional for DX; converted for the binding).
 * Official workers-types `EmailAddress` requires `name: string`.
 */
export interface EmailAddress {
    email: string;
    name?: string;
}

/** @deprecated Use EmailMessageBuilder — alias kept for cloudflare-kit consumers */
export type EmailMessage = EmailMessageBuilder;

export type EmailRecipient = string | EmailAddress | Array<string | EmailAddress>;

export interface EmailOptions {
    to: EmailAddress | EmailAddress[];
    subject: string;
    html?: string;
    text?: string;
    cc?: EmailAddress | EmailAddress[];
    bcc?: EmailAddress | EmailAddress[];
    replyTo?: EmailAddress;
    headers?: Record<string, string>;
}

export interface MailerOptions {
    from: EmailAddress;
    /** Cloudflare Email Service binding (env.EMAIL / send_email) */
    binding?: SendEmail;
}

export interface EmailResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

interface MailChannelsRequest {
    personalizations: Array<{
        to: Array<{ email: string; name?: string }>;
        cc?: Array<{ email: string; name?: string }>;
        bcc?: Array<{ email: string; name?: string }>;
    }>;
    from: { email: string; name?: string };
    reply_to?: { email: string; name?: string };
    subject: string;
    content: Array<{ type: string; value: string }>;
}

function toCfAddress(addr: string | EmailAddress): string | CfEmailAddress {
    if (typeof addr === "string") return addr;
    return { email: addr.email, name: addr.name ?? "" };
}

function toCfRecipients(
    addr: EmailAddress | EmailAddress[] | undefined,
): string | CfEmailAddress | Array<string | CfEmailAddress> | undefined {
    if (!addr) return undefined;
    if (Array.isArray(addr)) {
        return addr.map((a) => (a.name ? { email: a.email, name: a.name } : a.email));
    }
    return addr.name ? { email: addr.email, name: addr.name } : addr.email;
}

function normalizeAddress(addr: EmailAddress | EmailAddress[]): Array<{ email: string; name?: string }> {
    const addresses = Array.isArray(addr) ? addr : [addr];
    return addresses.map((a) => ({ email: a.email, name: a.name }));
}

/**
 * Create a mailer for Cloudflare Email Service (preferred) or deprecated MailChannels fallback.
 */
export function createMailer(options: MailerOptions) {
    const MAILCHANNELS_API = "https://api.mailchannels.net/tx/v1/send";
    let warnedAboutMailChannels = false;

    function buildBindingMessage(emailOptions: EmailOptions): EmailMessageBuilder {
        const to = toCfRecipients(emailOptions.to);
        if (!to) {
            throw new Error("Email `to` is required");
        }

        const message: EmailMessageBuilder = {
            to,
            from: toCfAddress(options.from),
            subject: emailOptions.subject,
        };

        if (emailOptions.text) message.text = emailOptions.text;
        if (emailOptions.html) message.html = emailOptions.html;
        if (emailOptions.cc) message.cc = toCfRecipients(emailOptions.cc);
        if (emailOptions.bcc) message.bcc = toCfRecipients(emailOptions.bcc);
        if (emailOptions.replyTo) message.replyTo = toCfAddress(emailOptions.replyTo);
        if (emailOptions.headers) message.headers = emailOptions.headers;

        return message;
    }

    function buildMailChannelsRequest(emailOptions: EmailOptions): MailChannelsRequest {
        const content: Array<{ type: string; value: string }> = [];
        if (emailOptions.text) content.push({ type: "text/plain", value: emailOptions.text });
        if (emailOptions.html) content.push({ type: "text/html", value: emailOptions.html });
        if (content.length === 0) content.push({ type: "text/plain", value: "" });

        const personalization: MailChannelsRequest["personalizations"][0] = {
            to: normalizeAddress(emailOptions.to),
        };
        if (emailOptions.cc) personalization.cc = normalizeAddress(emailOptions.cc);
        if (emailOptions.bcc) personalization.bcc = normalizeAddress(emailOptions.bcc);

        const request: MailChannelsRequest = {
            personalizations: [personalization],
            from: { email: options.from.email, name: options.from.name },
            subject: emailOptions.subject,
            content,
        };
        if (emailOptions.replyTo) {
            request.reply_to = { email: emailOptions.replyTo.email, name: emailOptions.replyTo.name };
        }
        return request;
    }

    async function send(emailOptions: EmailOptions): Promise<EmailResult> {
        if (options.binding) {
            const message = buildBindingMessage(emailOptions);
            const result = await options.binding.send(message);
            return { success: true, messageId: result.messageId || undefined };
        }

        if (!warnedAboutMailChannels) {
            warnedAboutMailChannels = true;
            console.warn(
                "[cloudflare-kit] MailChannels fallback is deprecated. Use a Cloudflare Email Service send_email binding.",
            );
        }

        const response = await fetch(MAILCHANNELS_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildMailChannelsRequest(emailOptions)),
        });

        if (!response.ok) {
            throw new Error(`MailChannels API error: ${response.status} - ${await response.text()}`);
        }
        return { success: true, messageId: crypto.randomUUID() };
    }

    const templates = new Map<string, string>();

    function registerTemplate(name: string, html: string): void {
        templates.set(name, html);
    }

    function escapeHtml(value: string): string {
        return value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    async function sendTemplate(
        templateName: string,
        data: Record<string, unknown>,
        to: EmailAddress,
        subject?: string,
    ): Promise<EmailResult> {
        const template = templates.get(templateName);
        if (!template) throw new Error(`Template not found: ${templateName}`);

        let html = template;
        for (const [key, value] of Object.entries(data)) {
            html = html.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), escapeHtml(String(value)));
        }
        const text = html
            .replace(/<[^>]*>/g, "")
            .replace(/\s+/g, " ")
            .trim();

        return send({ to, subject: subject || "", html, text });
    }

    return { send, registerTemplate, sendTemplate };
}

export type Mailer = ReturnType<typeof createMailer>;
