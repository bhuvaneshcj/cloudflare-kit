/**
 * Analytics Module
 *
 * Provides analytics tracking using Cloudflare Analytics Engine.
 */

/**
 * Analytics Engine dataset binding interface
 */
export interface AnalyticsEngineDataset {
    writeDataPoint(data: { indexes?: string[]; doubles?: number[]; blobs?: string[] }): void;
}

/**
 * Analytics options
 */
export interface AnalyticsOptions {
    /** Analytics Engine binding */
    binding: AnalyticsEngineDataset;
    /** Optional dataset name */
    dataset?: string;
}

/**
 * Analytics service
 */
export interface AnalyticsService {
    /** Track an event with properties */
    track(event: string, properties?: Record<string, string | number | boolean>): void;
    /** Track a request with auto-extracted properties */
    trackRequest(request: Request, extra?: Record<string, unknown>): void;
    /** Increment a counter metric */
    increment(metric: string, value?: number): void;
    /** Record a timing metric */
    timing(metric: string, durationMs: number): void;
}

/**
 * Create an analytics service
 *
 * @example
 * ```typescript
 * const analytics = createAnalytics({
 *   binding: env.ANALYTICS,
 *   dataset: 'api_metrics'
 * });
 *
 * // Track custom events
 * analytics.track('user_signup', {
 *   plan: 'pro',
 *   source: 'landing_page'
 * });
 *
 * // Track with numeric and boolean values
 * analytics.track('purchase', {
 *   product_id: 'prod_123',
 *   amount: 99.99,
 *   currency: 'USD',
 *   is_new_customer: true
 * });
 *
 * // Auto-track requests
 * app.use(async (ctx, next) => {
 *   const start = Date.now();
 *   analytics.trackRequest(ctx.request, {
 *     user_id: ctx.user?.id
 *   });
 *   const response = await next();
 *   analytics.timing('request_duration', Date.now() - start);
 *   return response;
 * });
 *
 * // Increment counters
 * analytics.increment('api_calls');
 * analytics.increment('errors', 1);
 *
 * // Record timings
 * analytics.timing('db_query', 45);
 * analytics.timing('api_response', 120);
 * ```
 */
export function createAnalytics(options: AnalyticsOptions): AnalyticsService {
    const binding = options.binding;
    const dataset = options.dataset || "default";

    /**
     * Convert value to appropriate Analytics Engine format
     * - Strings go to indexes (max 96 bytes each, first 4 searchable)
     * - Numbers go to doubles
     * - Booleans converted to 0/1 and go to doubles
     */
    function writeDataPoint(event: string, indexes: string[], doubles: number[], blobs?: string[]): void {
        try {
            binding.writeDataPoint({
                indexes: [event, dataset, ...indexes],
                doubles,
                blobs,
            });
        } catch (error) {
            // Silently fail and log warning
            console.warn("Analytics write failed:", error);
        }
    }

    /**
     * Track an event with properties
     */
    function track(event: string, properties?: Record<string, string | number | boolean>): void {
        const indexes: string[] = [];
        const doubles: number[] = [];
        const blobs: string[] = [];

        if (properties) {
            for (const [key, value] of Object.entries(properties)) {
                if (typeof value === "string") {
                    // Strings go to indexes (limited to 96 bytes, first 4 are searchable)
                    indexes.push(`${key}=${value.substring(0, 96)}`);
                } else if (typeof value === "number") {
                    // Numbers go to doubles
                    doubles.push(value);
                    blobs.push(`${key}=${value}`);
                } else if (typeof value === "boolean") {
                    // Booleans converted to 0/1
                    doubles.push(value ? 1 : 0);
                    blobs.push(`${key}=${value}`);
                }
            }
        }

        writeDataPoint(event, indexes, doubles, blobs.length > 0 ? blobs : undefined);
    }

    /**
     * Track a request with auto-extracted properties
     */
    function trackRequest(request: Request, extra?: Record<string, unknown>): void {
        const url = new URL(request.url);
        const headers = request.headers;

        const indexes: string[] = [`method=${request.method}`, `path=${url.pathname}`, `host=${url.hostname}`];

        // Add country if available from CF
        const country = headers.get("CF-IPCountry");
        if (country) {
            indexes.push(`country=${country}`);
        }

        // Add CF-Ray for tracing
        const ray = headers.get("CF-Ray");
        if (ray) {
            indexes.push(`ray=${ray.substring(0, 16)}`);
        }

        // Add extra properties
        if (extra) {
            for (const [key, value] of Object.entries(extra)) {
                if (typeof value === "string") {
                    indexes.push(`${key}=${value.substring(0, 96)}`);
                }
            }
        }

        writeDataPoint("request", indexes, [Date.now()]);
    }

    /**
     * Increment a counter metric
     */
    function increment(metric: string, value = 1): void {
        writeDataPoint("counter", [`metric=${metric}`], [value, Date.now()]);
    }

    /**
     * Record a timing metric
     */
    function timing(metric: string, durationMs: number): void {
        writeDataPoint("timing", [`metric=${metric}`], [durationMs, Date.now()]);
    }

    return {
        track,
        trackRequest,
        increment,
        timing,
    };
}

/**
 * Analytics service type
 */
export type Analytics = ReturnType<typeof createAnalytics>;
