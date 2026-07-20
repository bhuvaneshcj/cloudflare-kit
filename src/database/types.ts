/**
 * Database Type Definitions
 *
 * Re-exports official Cloudflare Workers D1 types (workers-types v5+).
 */

export type {
    D1Database,
    D1PreparedStatement,
    D1Result,
    D1Response,
    D1Meta,
    D1ExecResult,
    D1DatabaseSession,
    D1SessionBookmark,
    D1SessionConstraint,
} from "@cloudflare/workers-types";

import type { D1Database } from "@cloudflare/workers-types";

export interface DatabaseOptions {
    /** Official D1 database binding from the Worker env */
    binding: D1Database;
}
