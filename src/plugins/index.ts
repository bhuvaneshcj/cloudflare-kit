/**
 * Plugin System
 *
 * Extensible plugin architecture for Cloudflare Kit.
 *
 * @example
 * ```typescript
 * import { definePlugin, createApp } from 'cloudflare-kit';
 *
 * const myPlugin = definePlugin({
 *   name: 'my-plugin',
 *   version: '1.0.0',
 *   install(context) {
 *     context.logger.info('My plugin installed!');
 *   },
 *   hooks: {
 *     'request:start': (ctx) => {
 *       ctx.state.startTime = Date.now();
 *     }
 *   }
 * });
 *
 * const app = createApp({
 *   plugins: [myPlugin]
 * });
 * ```
 */

export type {
    Plugin,
    PluginContext,
    PluginHooks,
    PluginOptions,
    PluginDefinition,
    PluginRegistryEntry,
    PluginMetadata,
    App,
    HookHandler,
    HookResult,
} from "./types";

export { PluginRegistry, globalRegistry } from "./registry";

/**
 * Define a plugin with type safety
 */
export function definePlugin(plugin: {
    name: string;
    version: string;
    description?: string;
    author?: string;
    dependencies?: string[];
    install: (context: import("./types").PluginContext) => void | Promise<void>;
    hooks?: Partial<import("./types").PluginHooks>;
}): import("./types").Plugin {
    return plugin as import("./types").Plugin;
}

/**
 * Create a plugin from a factory function
 */
export function createPlugin(
    factory: (options?: Record<string, unknown>) => import("./types").Plugin,
): (options?: Record<string, unknown>) => import("./types").Plugin {
    return factory;
}

/**
 * Compose multiple plugins into one
 */
export function composePlugins(
    name: string,
    version: string,
    ...plugins: import("./types").Plugin[]
): import("./types").Plugin {
    return definePlugin({
        name,
        version,
        dependencies: plugins.flatMap((p) => p.dependencies || []),
        async install(context) {
            for (const plugin of plugins) {
                await plugin.install(context);
            }
        },
    });
}
