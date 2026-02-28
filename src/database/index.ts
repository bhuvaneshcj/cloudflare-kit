/**
 * Database Module
 *
 * Provides createDatabase() for D1 database operations.
 */

import type { D1Database, D1Result, DatabaseOptions } from "./types";
export type { D1Database, D1Result, DatabaseOptions };

/**
 * Validates SQL identifiers (table names, column names)
 * Only allows alphanumeric characters and underscores, starting with a letter or underscore
 */
function validateIdentifier(name: string): string {
    const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!VALID_IDENTIFIER.test(name)) {
        throw new Error(`Invalid SQL identifier: ${name}`);
    }
    return name;
}

/**
 * Create a database service
 *
 * @example
 * ```typescript
 * const database = createDatabase({
 *   binding: env.DB
 * });
 *
 * // Query users
 * const users = await database.query('SELECT * FROM users WHERE active = ?', [true]);
 *
 * // Get single user
 * const user = await database.get('SELECT * FROM users WHERE id = ?', ['123']);
 *
 * // Insert user
 * await database.execute('INSERT INTO users (id, email) VALUES (?, ?)', ['123', 'user@example.com']);
 *
 * // Update user
 * await database.execute('UPDATE users SET email = ? WHERE id = ?', ['new@example.com', '123']);
 *
 * // Delete user
 * await database.execute('DELETE FROM users WHERE id = ?', ['123']);
 * ```
 */
export function createDatabase(options: DatabaseOptions) {
    const db = options.binding;

    return {
        /**
         * Execute a query and return all results
         */
        async query<T = unknown>(sql: string, params: unknown[] = []): Promise<D1Result<T>> {
            try {
                const statement = db.prepare(sql);
                const result = await statement.bind(...params).all<T>();
                return result;
            } catch (error) {
                return {
                    results: [],
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                };
            }
        },

        /**
         * Execute a query and return first result only
         */
        async get<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
            try {
                const statement = db.prepare(sql);
                const result = await statement.bind(...params).first<T>();
                return result;
            } catch {
                return null;
            }
        },

        /**
         * Execute a write query (INSERT, UPDATE, DELETE)
         */
        async execute(sql: string, params: unknown[] = []): Promise<D1Result> {
            try {
                const statement = db.prepare(sql);
                const result = await statement.bind(...params).run();
                return result;
            } catch (error) {
                return {
                    results: [],
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                };
            }
        },

        /**
         * Insert a record and return the ID
         */
        async insert(table: string, data: Record<string, unknown>): Promise<string | number | null> {
            // Validate table name
            validateIdentifier(table);

            const keys = Object.keys(data);
            const values = Object.values(data);

            // Validate column names
            keys.forEach(validateIdentifier);

            const placeholders = keys.map(() => "?").join(", ");
            const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;

            const result = await this.execute(sql, values);
            return result.meta?.last_row_id ?? null;
        },

        /**
         * Update records
         */
        async update(
            table: string,
            data: Record<string, unknown>,
            whereClause: string,
            whereParams: unknown[],
        ): Promise<number> {
            // Validate table name
            validateIdentifier(table);

            const keys = Object.keys(data);
            const values = Object.values(data);

            // Validate column names
            keys.forEach(validateIdentifier);

            const setClause = keys.map((key) => `${key} = ?`).join(", ");
            const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;

            const result = await this.execute(sql, [...values, ...whereParams]);
            return result.meta?.changes ?? 0;
        },

        /**
         * Delete records
         */
        async delete(table: string, whereClause: string, whereParams: unknown[]): Promise<number> {
            // Validate table name
            validateIdentifier(table);

            const sql = `DELETE FROM ${table} WHERE ${whereClause}`;

            const result = await this.execute(sql, whereParams);
            return result.meta?.changes ?? 0;
        },

        /**
         * Run multiple queries in a batch
         */
        async batch<T = unknown>(queries: { sql: string; params: unknown[] }[]): Promise<D1Result<T>[]> {
            try {
                const statements = queries.map((q) => db.prepare(q.sql).bind(...q.params));
                const results = await db.batch<T>(statements);
                return results;
            } catch (error) {
                return [
                    {
                        results: [],
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    },
                ];
            }
        },

        /**
         * Get the raw D1 binding for advanced usage
         */
        getBinding(): D1Database {
            return db;
        },
    };
}

export type DatabaseService = ReturnType<typeof createDatabase>;
