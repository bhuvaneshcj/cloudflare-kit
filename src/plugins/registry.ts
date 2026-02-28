/**
 * Plugin Registry
 *
 * Manages plugin registration, dependencies, and lifecycle.
 */

import { PluginError } from "../errors";
import type { Plugin, PluginContext, PluginOptions, PluginRegistryEntry, PluginHooks } from "./types";

/**
 * Plugin Registry class
 */
export class PluginRegistry {
    private plugins = new Map<string, PluginRegistryEntry>();
    private hooks = new Map<keyof PluginHooks, Set<PluginHooks[keyof PluginHooks]>>();
    private installedOrder: string[] = [];

    /**
     * Register a plugin
     */
    register(plugin: Plugin, options: PluginOptions = {}): void {
        if (this.plugins.has(plugin.name)) {
            throw new PluginError(`Plugin "${plugin.name}" is already registered`, plugin.name);
        }

        // Check dependencies
        if (plugin.dependencies) {
            for (const dep of plugin.dependencies) {
                if (!this.plugins.has(dep)) {
                    throw new PluginError(
                        `Plugin "${plugin.name}" requires "${dep}" which is not registered`,
                        plugin.name,
                    );
                }
            }
        }

        this.plugins.set(plugin.name, {
            plugin,
            options: {
                enabled: true,
                priority: 100,
                ...options,
            },
            installed: false,
        });

        // Register hooks
        if (plugin.hooks) {
            for (const [event, handler] of Object.entries(plugin.hooks)) {
                if (handler) {
                    this.on(event as keyof PluginHooks, handler as PluginHooks[keyof PluginHooks]);
                }
            }
        }
    }

    /**
     * Unregister a plugin
     */
    unregister(name: string): void {
        const entry = this.plugins.get(name);
        if (!entry) {
            throw new PluginError(`Plugin "${name}" is not registered`, name);
        }

        if (entry.installed) {
            throw new PluginError(`Cannot unregister installed plugin "${name}". Shutdown the app first.`, name);
        }

        // Check if other plugins depend on this
        for (const [pluginName, otherEntry] of this.plugins) {
            if (otherEntry.plugin.dependencies?.includes(name)) {
                throw new PluginError(`Cannot unregister "${name}" because "${pluginName}" depends on it`, name);
            }
        }

        this.plugins.delete(name);
    }

    /**
     * Install all registered plugins
     */
    async installAll(context: PluginContext): Promise<void> {
        const sorted = this.getSortedPlugins();

        for (const entry of sorted) {
            if (entry.options.enabled && !entry.installed) {
                try {
                    await entry.plugin.install(context);
                    entry.installed = true;
                    this.installedOrder.push(entry.plugin.name);
                    context.logger.debug(`Plugin "${entry.plugin.name}" installed successfully`);
                } catch (error) {
                    entry.error = error instanceof Error ? error : new Error(String(error));
                    throw new PluginError(
                        `Failed to install plugin "${entry.plugin.name}": ${entry.error.message}`,
                        entry.plugin.name,
                    );
                }
            }
        }
    }

    /**
     * Get sorted plugins by priority and dependencies
     */
    private getSortedPlugins(): PluginRegistryEntry[] {
        const entries = Array.from(this.plugins.values());

        return entries.sort((a, b) => {
            // First sort by priority
            const priorityDiff = (a.options.priority ?? 100) - (b.options.priority ?? 100);
            if (priorityDiff !== 0) return priorityDiff;

            // Then by dependency order
            if (a.plugin.dependencies?.includes(b.plugin.name)) return 1;
            if (b.plugin.dependencies?.includes(a.plugin.name)) return -1;

            return 0;
        });
    }

    /**
     * Register a hook handler
     */
    on<K extends keyof PluginHooks>(event: K, handler: PluginHooks[K]): void {
        if (!this.hooks.has(event)) {
            this.hooks.set(event, new Set());
        }
        this.hooks.get(event)!.add(handler);
    }

    /**
     * Unregister a hook handler
     */
    off<K extends keyof PluginHooks>(event: K, handler: PluginHooks[K]): void {
        this.hooks.get(event)?.delete(handler);
    }

    /**
     * Emit a hook event to all registered handlers
     */
    async emit<K extends keyof PluginHooks>(event: K, ...args: Parameters<NonNullable<PluginHooks[K]>>): Promise<void> {
        const handlers = this.hooks.get(event);
        if (!handlers) return;

        for (const handler of handlers) {
            try {
                await (handler as (...args: unknown[]) => Promise<void> | void)(...args);
            } catch (error) {
                // Log but don't stop other handlers
                console.error(`Hook handler for "${event}" failed:`, error);
            }
        }
    }

    /**
     * Get a plugin by name
     */
    get(name: string): Plugin | undefined {
        return this.plugins.get(name)?.plugin;
    }

    /**
     * Check if a plugin is registered
     */
    has(name: string): boolean {
        return this.plugins.has(name);
    }

    /**
     * Check if a plugin is installed
     */
    isInstalled(name: string): boolean {
        return this.plugins.get(name)?.installed ?? false;
    }

    /**
     * Get all registered plugin names
     */
    get names(): string[] {
        return Array.from(this.plugins.keys());
    }

    /**
     * Get all installed plugin names
     */
    get installedNames(): string[] {
        return this.installedOrder;
    }

    /**
     * Clear all plugins
     */
    clear(): void {
        this.plugins.clear();
        this.hooks.clear();
        this.installedOrder = [];
    }
}

/**
 * Global plugin registry instance
 */
export const globalRegistry = new PluginRegistry();
