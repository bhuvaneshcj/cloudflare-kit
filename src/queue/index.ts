/**
 * Queue Module
 *
 * Provides createQueue() for Queue handling in Cloudflare Workers.
 */

import type { Queue } from "@cloudflare/workers-types";

export interface QueueOptions {
    binding: Queue<unknown>;
}

export interface QueueMessage<T = unknown> {
    id: string;
    body: T;
    timestamp: number;
    attempts: number;
}

export interface SendResult {
    success: boolean;
    error?: string;
}

export interface QueueHandler<T = unknown> {
    (message: T): Promise<void> | void;
}

/**
 * Create a queue service
 *
 * @example
 * ```typescript
 * const queue = createQueue({
 *   binding: env.MY_QUEUE
 * });
 *
 * // Send a message to the queue
 * await queue.send({ type: 'send-email', to: 'user@example.com' });
 *
 * // Send multiple messages
 * await queue.sendBatch([
 *   { type: 'send-email', to: 'user1@example.com' },
 *   { type: 'send-email', to: 'user2@example.com' }
 * ]);
 * ```
 */
export function createQueue<T = unknown>(options: QueueOptions) {
    const queueBinding = options.binding;

    return {
        /**
         * Send a single message to the queue
         */
        async send(body: T, options?: { delaySeconds?: number }): Promise<SendResult> {
            try {
                await queueBinding.send(body, { delaySeconds: options?.delaySeconds });
                return { success: true };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : "Failed to send message",
                };
            }
        },

        /**
         * Send multiple messages to the queue
         */
        async sendBatch(messages: T[]): Promise<SendResult> {
            try {
                const batch = messages.map((body) => ({ body }));
                await queueBinding.sendBatch(batch);
                return { success: true };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : "Failed to send batch",
                };
            }
        },

        /**
         * Get the raw Queue binding for advanced usage
         */
        getBinding(): Queue<unknown> {
            return queueBinding;
        },
    };
}

/**
 * Create a queue consumer handler
 *
 * @example
 * ```typescript
 * const emailQueue = createQueue({ binding: env.EMAIL_QUEUE });
 *
 * export default {
 *   async fetch(request, env, ctx) {
 *     // Regular HTTP handler
 *   },
 *
 *   async queue(batch, env, ctx) {
 *     // Queue consumer handler
 *     const handler = createQueueConsumer(async (message) => {
 *       console.log('Processing:', message);
 *       // Process the message
 *     });
 *
 *     await handler(batch, env, ctx);
 *   }
 * };
 * ```
 */
export function createQueueConsumer<T = unknown>(
    processor: QueueHandler<T>,
): (batch: MessageBatch<T>, _env: unknown, _ctx: ExecutionContext) => Promise<void> {
    return async (batch: MessageBatch<T>, _env: unknown, _ctx: ExecutionContext) => {
        for (const message of batch.messages) {
            try {
                await processor(message.body);
                message.ack();
            } catch (error) {
                console.error("Failed to process message:", error);
                message.retry();
            }
        }
    };
}

export type QueueService<T = unknown> = ReturnType<typeof createQueue<T>>;
export type { Queue };

// Type for MessageBatch from Cloudflare
type MessageBatch<T> = {
    queue: string;
    messages: Array<{
        id: string;
        timestamp: Date;
        body: T;
        attempts: number;
        ack: () => void;
        retry: () => void;
    }>;
};
