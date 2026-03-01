/**
 * Scheduler Module
 *
 * Provides scheduled task support for Cloudflare Workers using Cron triggers.
 */

import type { App } from "../core/app";

/**
 * Scheduled event from Cloudflare
 */
export interface ScheduledEvent {
    /** The cron trigger that fired */
    cron: string;
    /** When the event was scheduled (Unix timestamp in milliseconds) */
    scheduledTime: number;
    /** Unique event ID */
    type: "scheduled";
}

/**
 * Scheduled handler function
 */
export type ScheduledHandler = (
    event: ScheduledEvent,
    env: Record<string, unknown>,
    ctx: ExecutionContext,
) => void | Promise<void>;

/**
 * Cron registration
 */
interface CronRegistration {
    expression: string;
    handler: ScheduledHandler;
}

/**
 * Scheduler service
 */
export interface Scheduler {
    /** Register a handler for a cron expression */
    cron(cronExpression: string, handler: ScheduledHandler): Scheduler;
    /** The scheduled handler to export for Cloudflare */
    scheduled: (event: ScheduledEvent, env: Record<string, unknown>, ctx: ExecutionContext) => Promise<void>;
}

/**
 * Create a scheduler for handling cron tasks
 *
 * Usage: scheduler.cron('0 * * * *', handler)
 */
export function createScheduler(): Scheduler {
    const crons: CronRegistration[] = [];

    /**
     * Register a cron handler
     */
    function registerCron(cronExpression: string, handler: ScheduledHandler): Scheduler {
        crons.push({ expression: cronExpression, handler });
        return { cron: registerCron, scheduled };
    }

    /**
     * The scheduled handler for Cloudflare
     */
    async function scheduled(
        event: ScheduledEvent,
        env: Record<string, unknown>,
        ctx: ExecutionContext,
    ): Promise<void> {
        // Find matching cron handlers
        const matchingCrons = crons.filter((c) => c.expression === event.cron);

        if (matchingCrons.length === 0) {
            console.warn("No handler registered for cron expression: " + event.cron);
            return;
        }

        // Execute all matching handlers
        const promises = matchingCrons.map(async (registration) => {
            try {
                await registration.handler(event, env, ctx);
            } catch (error) {
                console.error("Cron handler error:", error);
            }
        });

        await Promise.all(promises);
    }

    return {
        cron: registerCron,
        scheduled,
    };
}

/**
 * Combined app with scheduled support
 */
export interface ScheduledApp extends App {
    scheduled: (event: ScheduledEvent, env: Record<string, unknown>, ctx: ExecutionContext) => Promise<void>;
}

/**
 * Create a combined app with both fetch and scheduled handlers
 *
 * Usage: export default createScheduledApp(app, scheduler)
 */
export function createScheduledApp(app: App, scheduler: Scheduler): ScheduledApp {
    const scheduledApp = app as ScheduledApp;
    scheduledApp.scheduled = scheduler.scheduled;
    return scheduledApp;
}

/**
 * Create a simple scheduled-only worker
 */
export function createScheduledWorker(scheduler: Scheduler): {
    scheduled: (event: ScheduledEvent, env: Record<string, unknown>, ctx: ExecutionContext) => Promise<void>;
} {
    return {
        scheduled: scheduler.scheduled,
    };
}
