/**
 * Email Module
 *
 * Provides email sending capabilities via MailChannels API.
 * Works with Cloudflare Workers without external dependencies.
 */

/**
 * Cloudflare SendEmail binding interface
 */
export interface SendEmail {
    send(message: EmailMessage): Promise<void>;
}

/**
 * Email message for Cloudflare binding
 */
export interface EmailMessage {
    to: string | string[];
    from: string;
    subject: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
}

/**
 * Email address type
 */
export interface EmailAddress {
    /** Email address */
    email: string;
    /** Display name (optional) */
    name?: string;
}

/**
 * Email options for sending
 */
export interface EmailOptions {
    /** Recipient(s) */
    to: EmailAddress | EmailAddress[];
    /** Email subject */
    subject: string;
    /** HTML body (optional) */
    html?: string;
    /** Plain text body (optional) */
    text?: string;
    /** CC recipients (optional) */
    cc?: EmailAddress | EmailAddress[];
    /** BCC recipients (optional) */
    bcc?: EmailAddress | EmailAddress[];
    /** Reply-to address (optional) */
    replyTo?: EmailAddress;
}

/**
 * Mailer options
 */
export interface MailerOptions {
    /** Default from address */
    from: EmailAddress;
    /** Cloudflare Email binding (optional, falls back to MailChannels API) */
    binding?: SendEmail;
}

/**
 * Email sending result
 */
export interface EmailResult {
    /** Whether the email was sent successfully */
    success: boolean;
    /** Message ID if available */
    messageId?: string;
    /** Error message if sending failed */
    error?: string;
}

/**
 * MailChannels API request body
 */
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

/**
 * Convert EmailAddress to string or MailChannels format
 */
function normalizeAddress(addr: EmailAddress | EmailAddress[]): Array<{ email: string; name?: string }> {
    const addresses = Array.isArray(addr) ? addr : [addr];
    return addresses.map((a) => ({
        email: a.email,
        name: a.name,
    }));
}

/**
 * Create a mailer for sending emails
 *
 * @example
 * ```typescript
 * const mailer = createMailer({
 *   from: { email: 'noreply@example.com', name: 'My App' },
 *   // Optional: use Cloudflare Email binding instead of MailChannels API
 *   // binding: env.SEND_EMAIL
 * });
 *
 * // Send a simple email
 * const result = await mailer.send({
 *   to: { email: 'user@example.com', name: 'John Doe' },
 *   subject: 'Welcome!',
 *   text: 'Welcome to our app!',
 *   html: '<h1>Welcome!</h1><p>Welcome to our app!</p>'
 * });
 *
 * if (result.success) {
 *   console.log('Email sent:', result.messageId);
 * } else {
 *   console.error('Failed to send email:', result.error);
 * }
 *
 * // Send to multiple recipients
 * await mailer.send({
 *   to: [
 *     { email: 'user1@example.com' },
 *     { email: 'user2@example.com' }
 *   ],
 *   subject: 'Newsletter',
 *   html: '<p>Your monthly newsletter</p>'
 * });
 *
 * // Send using a template
 * await mailer.sendTemplate('welcome', {
 *   name: 'John',
 *   company: 'Acme Inc'
 * }, { email: 'user@example.com' });
 * ```
 */
export function createMailer(options: MailerOptions) {
    const MAILCHANNELS_API = "https://api.mailchannels.net/tx/v1/send";

    /**
     * Send an email
     */
    async function send(emailOptions: EmailOptions): Promise<EmailResult> {
        try {
            // Use Cloudflare Email binding if available
            if (options.binding) {
                const message = buildBindingMessage(emailOptions);
                await options.binding.send(message);
                return { success: true, messageId: crypto.randomUUID() };
            }

            // Fall back to MailChannels API
            const requestBody = buildMailChannelsRequest(emailOptions);

            const response = await fetch(MAILCHANNELS_API, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            if (response.ok) {
                return { success: true, messageId: crypto.randomUUID() };
            } else {
                const errorText = await response.text();
                return {
                    success: false,
                    error: `MailChannels API error: ${response.status} - ${errorText}`,
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    /**
     * Build EmailMessage for Cloudflare binding
     */
    function buildBindingMessage(emailOptions: EmailOptions): EmailMessage {
        const to = Array.isArray(emailOptions.to) ? emailOptions.to.map((a) => a.email) : emailOptions.to.email;

        const message: EmailMessage = {
            to,
            from: options.from.email,
            subject: emailOptions.subject,
        };

        if (emailOptions.text) {
            message.text = emailOptions.text;
        }

        if (emailOptions.html) {
            message.html = emailOptions.html;
        }

        return message;
    }

    /**
     * Build MailChannels API request body
     */
    function buildMailChannelsRequest(emailOptions: EmailOptions): MailChannelsRequest {
        const content: Array<{ type: string; value: string }> = [];

        if (emailOptions.text) {
            content.push({ type: "text/plain", value: emailOptions.text });
        }

        if (emailOptions.html) {
            content.push({ type: "text/html", value: emailOptions.html });
        }

        // Default to plain text if neither provided
        if (content.length === 0) {
            content.push({ type: "text/plain", value: "" });
        }

        const personalization: MailChannelsRequest["personalizations"][0] = {
            to: normalizeAddress(emailOptions.to),
        };

        if (emailOptions.cc) {
            personalization.cc = normalizeAddress(emailOptions.cc);
        }

        if (emailOptions.bcc) {
            personalization.bcc = normalizeAddress(emailOptions.bcc);
        }

        const request: MailChannelsRequest = {
            personalizations: [personalization],
            from: {
                email: options.from.email,
                name: options.from.name,
            },
            subject: emailOptions.subject,
            content,
        };

        if (emailOptions.replyTo) {
            request.reply_to = {
                email: emailOptions.replyTo.email,
                name: emailOptions.replyTo.name,
            };
        }

        return request;
    }

    /**
     * Simple template storage
     */
    const templates = new Map<string, string>();

    /**
     * Register a template
     */
    function registerTemplate(name: string, html: string): void {
        templates.set(name, html);
    }

    /**
     * Send an email using a registered template
     */
    async function sendTemplate(
        templateName: string,
        data: Record<string, unknown>,
        to: EmailAddress,
        subject?: string,
    ): Promise<EmailResult> {
        const template = templates.get(templateName);

        if (!template) {
            return {
                success: false,
                error: `Template not found: ${templateName}`,
            };
        }

        // Simple variable interpolation: {{variableName}}
        let html = template;
        for (const [key, value] of Object.entries(data)) {
            const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
            html = html.replace(regex, String(value));
        }

        // Generate plain text version by stripping HTML tags
        const text = html
            .replace(/<[^>]*>/g, "")
            .replace(/\s+/g, " ")
            .trim();

        return send({
            to,
            subject: subject || "",
            html,
            text,
        });
    }

    return {
        /**
         * Send an email
         */
        send,

        /**
         * Register an email template
         */
        registerTemplate,

        /**
         * Send using a template with variable interpolation
         */
        sendTemplate,
    };
}

/**
 * Mailer service type
 */
export type Mailer = ReturnType<typeof createMailer>;
