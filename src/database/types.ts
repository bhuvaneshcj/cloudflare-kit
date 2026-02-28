/**
 * Database Type Definitions
 */

export interface D1Result<T = unknown> {
    results: T[];
    success: boolean;
    error?: string;
    meta?: {
        duration: number;
        changes?: number;
        last_row_id?: number;
        rows_read?: number;
        rows_written?: number;
    };
}

export interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
    exec(query: string): Promise<D1Result>;
    query<T = unknown>(query: string, params?: unknown[]): Promise<D1Result<T>>;
    execute(query: string, params?: unknown[]): Promise<D1Result>;
}

export interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(): Promise<T | null>;
    run(): Promise<D1Result>;
    all<T = unknown>(): Promise<D1Result<T>>;
    raw<T = unknown>(): Promise<T[]>;
}

export interface DatabaseOptions {
    binding: D1Database;
    migrationsPath?: string;
}
