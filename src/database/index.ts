/**
 * Database Module
 *
 * Provides createDatabase() for D1 database operations.
 */

import type { D1Database, D1Result, DatabaseOptions } from "./types";
import { DatabaseError } from "../errors/index";

export type { D1Database, D1Result, DatabaseOptions };

/**
 * Validates SQL identifiers (table names, column names)
 * Only allows alphanumeric characters and underscores, starting with a letter or underscore
 */
function validateIdentifier(name: string): string {
    const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!VALID_IDENTIFIER.test(name)) {
        throw new DatabaseError(`Invalid SQL identifier: ${name}`);
    }
    return name;
}

/**
 * Build a parameterized WHERE clause from a structured record (AND equality only)
 */
function buildWhereClause(where: Record<string, unknown>): { clause: string; params: unknown[] } {
    const keys = Object.keys(where);
    if (keys.length === 0) {
        throw new DatabaseError("WHERE clause requires at least one condition");
    }

    const parts: string[] = [];
    const params: unknown[] = [];

    for (const key of keys) {
        validateIdentifier(key);
        parts.push(`${key} = ?`);
        params.push(where[key]);
    }

    return { clause: parts.join(" AND "), params };
}

export interface DatabaseService {
    query<T = unknown>(sql: string, params?: unknown[]): Promise<D1Result<T>>;
    get<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>;
    execute(sql: string, params?: unknown[]): Promise<D1Result>;
    insert(table: string, data: Record<string, unknown>): Promise<string | number | null>;
    update(table: string, data: Record<string, unknown>, where: Record<string, unknown>): Promise<number>;
    delete(table: string, where: Record<string, unknown>): Promise<number>;
    batch<T = unknown>(queries: { sql: string; params: unknown[] }[]): Promise<D1Result<T>[]>;
    getBinding(): D1Database;
}

/**
 * Create a database service
 */
export function createDatabase(options: DatabaseOptions): DatabaseService {
    const db = options.binding;

    return {
        async query<T = unknown>(sql: string, params: unknown[] = []): Promise<D1Result<T>> {
            try {
                const statement = db.prepare(sql);
                return await statement.bind(...params).all<T>();
            } catch (error) {
                throw new DatabaseError(error instanceof Error ? error.message : "Database query failed", sql, error instanceof Error ? error : undefined);
            }
        },

        async get<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
            try {
                const statement = db.prepare(sql);
                return await statement.bind(...params).first<T>();
            } catch (error) {
                throw new DatabaseError(error instanceof Error ? error.message : "Database get failed", sql, error instanceof Error ? error : undefined);
            }
        },

        async execute(sql: string, params: unknown[] = []): Promise<D1Result> {
            try {
                const statement = db.prepare(sql);
                return await statement.bind(...params).run();
            } catch (error) {
                throw new DatabaseError(error instanceof Error ? error.message : "Database execute failed", sql, error instanceof Error ? error : undefined);
            }
        },

        async insert(table: string, data: Record<string, unknown>): Promise<string | number | null> {
            validateIdentifier(table);

            const keys = Object.keys(data);
            const values = Object.values(data);
            keys.forEach(validateIdentifier);

            const placeholders = keys.map(() => "?").join(", ");
            const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;

            const result = await this.execute(sql, values);
            return result.meta?.last_row_id ?? null;
        },

        async update(table: string, data: Record<string, unknown>, where: Record<string, unknown>): Promise<number> {
            validateIdentifier(table);

            const keys = Object.keys(data);
            const values = Object.values(data);
            keys.forEach(validateIdentifier);

            const { clause, params: whereParams } = buildWhereClause(where);
            const setClause = keys.map((key) => `${key} = ?`).join(", ");
            const sql = `UPDATE ${table} SET ${setClause} WHERE ${clause}`;

            const result = await this.execute(sql, [...values, ...whereParams]);
            return result.meta?.changes ?? 0;
        },

        async delete(table: string, where: Record<string, unknown>): Promise<number> {
            validateIdentifier(table);

            const { clause, params: whereParams } = buildWhereClause(where);
            const sql = `DELETE FROM ${table} WHERE ${clause}`;

            const result = await this.execute(sql, whereParams);
            return result.meta?.changes ?? 0;
        },

        async batch<T = unknown>(queries: { sql: string; params: unknown[] }[]): Promise<D1Result<T>[]> {
            try {
                const statements = queries.map((q) => db.prepare(q.sql).bind(...q.params));
                return await db.batch<T>(statements);
            } catch (error) {
                throw new DatabaseError(
                    error instanceof Error ? error.message : "Database batch failed",
                    undefined,
                    error instanceof Error ? error : undefined,
                );
            }
        },

        getBinding(): D1Database {
            return db;
        },
    };
}

export { buildWhereClause, validateIdentifier };
