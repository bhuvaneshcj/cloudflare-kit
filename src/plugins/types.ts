/**
 * Plugin System Types
 *
 * Defines the interfaces for the extensible plugin architecture.
 */

// Local type definitions to avoid circular dependencies
interface Logger {
    debug(message: string, data?: Record<string, unknown>): void;
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(message: string, data?: Record<string, unknown>): void;
}

interface RequestContext {
    request: Request;
    url: URL;
    env: Record<string, unknown>;
    executionContext: ExecutionContext;
    state: Record<string, unknown>;
}

/**
 * Application interface that plugins interact with
 */
export interface App {
    readonly name: string;
    readonly version: string;
    readonly config: Record<string, unknown>;
    readonly logger: Logger;

    /**
     * Register a hook listener
     */
    on<K extends keyof PluginHooks>(event: K, handler: PluginHooks[K]): void;

    /**
     * Emit a hook event
     */
    emit<K extends keyof PluginHooks>(event: K, ...args: Parameters<NonNullable<PluginHooks[K]>>): Promise<void>;

    /**
     * Get a provider by name
     */
    getProvider<T>(name: string): T | undefined;

    /**
     * Set a provider
     */
    setProvider<T>(name: string, provider: T): void;
}

/**
 * Plugin context passed during installation
 */
export interface PluginContext {
    /**
     * The application instance
     */
    app: App;

    /**
     * Application configuration
     */
    config: Record<string, unknown>;

    /**
     * Logger instance
     */
    logger: Logger;

    /**
     * Environment bindings
     */
    env?: Record<string, unknown>;
}

/**
 * Plugin hook definitions
 */
export interface PluginHooks {
    /**
     * Called when the application is initializing
     */
    "app:init": (app: App) => void | Promise<void>;

    /**
     * Called when the application is shutting down
     */
    "app:shutdown": (app: App) => void | Promise<void>;

    /**
     * Called at the start of request processing
     */
    "request:start": (ctx: RequestContext) => void | Promise<void>;

    /**
     * Called at the end of request processing (before response sent)
     */
    "request:end": (ctx: RequestContext, response: Response) => void | Promise<void>;

    /**
     * Called when an error occurs during request processing
     */
    "request:error": (ctx: RequestContext, error: Error) => void | Promise<void>;

    /**
     * Called when a route is registered
     */
    "route:register": (method: string, path: string) => void | Promise<void>;

    /**
     * Called when middleware is registered
     */
    "middleware:register": (name: string) => void | Promise<void>;
}

/**
 * Plugin interface
 */
export interface Plugin {
    /**
     * Unique plugin name
     */
    name: string;

    /**
     * Plugin version (semver)
     */
    version: string;

    /**
     * Plugin description
     */
    description?: string;

    /**
     * Plugin author
     */
    author?: string;

    /**
     * Plugin dependencies (names of other plugins that must be loaded first)
     */
    dependencies?: string[];

    /**
     * Install function called when plugin is registered
     */
    install: (context: PluginContext) => void | Promise<void>;

    /**
     * Optional hook handlers
     */
    hooks?: {
        [K in keyof PluginHooks]?: PluginHooks[K];
    };
}

/**
 * Plugin configuration options
 */
export interface PluginOptions {
    /**
     * Enable/disable plugin
     */
    enabled?: boolean;

    /**
     * Plugin-specific configuration
     */
    config?: Record<string, unknown>;

    /**
     * Priority (lower numbers load first)
     */
    priority?: number;
}

/**
 * Plugin definition helper type
 */
export type PluginDefinition = Plugin | (() => Plugin);

/**
 * Plugin registry entry
 */
export interface PluginRegistryEntry {
    plugin: Plugin;
    options: PluginOptions;
    installed: boolean;
    error?: Error;
}

/**
 * Hook handler type
 */
export type HookHandler<T extends keyof PluginHooks> = NonNullable<PluginHooks[T]>;

/**
 * Async hook result
 */
export type HookResult = void | Promise<void>;

/**
 * Plugin metadata for discovery
 */
export interface PluginMetadata {
    name: string;
    version: string;
    description?: string;
    author?: string;
    homepage?: string;
    repository?: string;
    keywords?: string[];
    license?: string;
}
