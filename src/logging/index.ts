/**
 * Logging Module
 *
 * Provides createLogger() for structured logging.
 */

export interface LoggerOptions {
    level?: "debug" | "info" | "warn" | "error";
    service?: string;
    environment?: string;
}

export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    service?: string;
    environment?: string;
    data?: Record<string, unknown>;
}

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

/**
 * Create a structured logger
 *
 * @example
 * ```typescript
 * const logger = createLogger({
 *   level: 'info',
 *   service: 'my-api',
 *   environment: 'production'
 * });
 *
 * // Log messages
 * logger.debug('Debug information', { userId: '123' });
 * logger.info('User logged in', { userId: '123' });
 * logger.warn('Rate limit approaching', { userId: '123' });
 * logger.error('Failed to save user', { error: err.message });
 * ```
 */
export function createLogger(options: LoggerOptions = {}) {
    const minLevel = options.level || "info";
    const service = options.service || "app";
    const environment = options.environment || "development";

    function shouldLog(level: LogLevel): boolean {
        return LOG_LEVELS[level] >= LOG_LEVELS[minLevel];
    }

    function formatLog(level: LogLevel, message: string, data?: Record<string, unknown>): LogEntry {
        return {
            timestamp: new Date().toISOString(),
            level: level.toUpperCase(),
            message,
            service,
            environment,
            ...(data && { data }),
        };
    }

    function output(entry: LogEntry): void {
        const output = JSON.stringify(entry);

        switch (entry.level) {
            case "ERROR":
                console.error(output);
                break;
            case "WARN":
                console.warn(output);
                break;
            default:
                console.log(output);
        }
    }

    return {
        /**
         * Log debug message
         */
        debug(message: string, data?: Record<string, unknown>): void {
            if (shouldLog("debug")) {
                output(formatLog("debug", message, data));
            }
        },

        /**
         * Log info message
         */
        info(message: string, data?: Record<string, unknown>): void {
            if (shouldLog("info")) {
                output(formatLog("info", message, data));
            }
        },

        /**
         * Log warning message
         */
        warn(message: string, data?: Record<string, unknown>): void {
            if (shouldLog("warn")) {
                output(formatLog("warn", message, data));
            }
        },

        /**
         * Log error message
         */
        error(message: string, data?: Record<string, unknown>): void {
            if (shouldLog("error")) {
                output(formatLog("error", message, data));
            }
        },

        /**
         * Create a child logger with additional context
         */
        child(additionalContext: Record<string, unknown>) {
            return {
                debug(message: string, data?: Record<string, unknown>): void {
                    if (shouldLog("debug")) {
                        output(formatLog("debug", message, { ...additionalContext, ...data }));
                    }
                },
                info(message: string, data?: Record<string, unknown>): void {
                    if (shouldLog("info")) {
                        output(formatLog("info", message, { ...additionalContext, ...data }));
                    }
                },
                warn(message: string, data?: Record<string, unknown>): void {
                    if (shouldLog("warn")) {
                        output(formatLog("warn", message, { ...additionalContext, ...data }));
                    }
                },
                error(message: string, data?: Record<string, unknown>): void {
                    if (shouldLog("error")) {
                        output(formatLog("error", message, { ...additionalContext, ...data }));
                    }
                },
                child(nestedContext: Record<string, unknown>) {
                    return createLogger({ level: minLevel, service, environment }).child({
                        ...additionalContext,
                        ...nestedContext,
                    });
                },
                getLevel(): string {
                    return minLevel;
                },
            };
        },

        /**
         * Get current log level
         */
        getLevel(): string {
            return minLevel;
        },
    };
}

export type Logger = ReturnType<typeof createLogger>;
