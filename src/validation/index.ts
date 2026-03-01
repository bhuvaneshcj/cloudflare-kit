/**
 * Validation Module
 *
 * Provides a lightweight schema builder and validator for request validation.
 * No external dependencies - uses only native TypeScript.
 */

import type { RequestContext, Middleware } from "../core/types";

/**
 * Extended request context with validation
 */
export interface ValidatedContext extends RequestContext {
    params: Record<string, string>;
    query: Record<string, string>;
    body?: unknown;
    validatedQuery?: unknown;
    validatedParams?: unknown;
}

/**
 * Validation error details
 */
export interface ValidationErrorDetail {
    field: string;
    message: string;
}

/**
 * Validation result
 */
export interface ValidationResult<T> {
    success: boolean;
    data?: T;
    errors?: ValidationErrorDetail[];
}

/**
 * Base schema interface
 */
export interface Schema<T> {
    _type: T;
    parse(value: unknown, path?: string): ValidationResult<T>;
    optional(): Schema<T | undefined>;
}

/**
 * Internal schema implementation
 */
class SchemaImpl<T> implements Schema<T> {
    _type!: T;

    constructor(
        private validators: Array<(value: unknown, path: string) => ValidationErrorDetail[]>,
        private isOptional = false,
    ) {}

    parse(value: unknown, path = ""): ValidationResult<T> {
        // Handle optional
        if (value === undefined && this.isOptional) {
            return { success: true, data: undefined as T };
        }

        const errors: ValidationErrorDetail[] = [];

        for (const validator of this.validators) {
            const result = validator(value, path);
            errors.push(...result);
        }

        if (errors.length > 0) {
            return { success: false, errors };
        }

        return { success: true, data: value as T };
    }

    optional(): Schema<T | undefined> {
        const optionalSchema = new SchemaImpl<T | undefined>(this.validators, true);
        return optionalSchema;
    }
}

/**
 * String schema
 */
class StringSchema extends SchemaImpl<string> {
    constructor(validators: Array<(value: unknown, path: string) => ValidationErrorDetail[]> = []) {
        super([
            (value, path) => {
                if (typeof value !== "string") {
                    return [{ field: path || "value", message: "Expected string" }];
                }
                return [];
            },
            ...validators,
        ]);
    }

    minLength(min: number): StringSchema {
        const newValidators = [
            ...this.getValidators(),
            (value: unknown, path: string) => {
                if (typeof value === "string" && value.length < min) {
                    return [{ field: path || "value", message: `String must be at least ${min} characters` }];
                }
                return [];
            },
        ];
        return new StringSchema(newValidators.slice(1));
    }

    maxLength(max: number): StringSchema {
        const newValidators = [
            ...this.getValidators(),
            (value: unknown, path: string) => {
                if (typeof value === "string" && value.length > max) {
                    return [{ field: path || "value", message: `String must be at most ${max} characters` }];
                }
                return [];
            },
        ];
        return new StringSchema(newValidators.slice(1));
    }

    email(): StringSchema {
        const newValidators = [
            ...this.getValidators(),
            (value: unknown, path: string) => {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (typeof value === "string" && !emailRegex.test(value)) {
                    return [{ field: path || "value", message: "Invalid email address" }];
                }
                return [];
            },
        ];
        return new StringSchema(newValidators.slice(1));
    }

    url(): StringSchema {
        const newValidators = [
            ...this.getValidators(),
            (value: unknown, path: string) => {
                if (typeof value !== "string") return [];
                try {
                    new URL(value);
                    return [];
                } catch {
                    return [{ field: path || "value", message: "Invalid URL" }];
                }
            },
        ];
        return new StringSchema(newValidators.slice(1));
    }

    private getValidators(): Array<(value: unknown, path: string) => ValidationErrorDetail[]> {
        return [];
    }
}

/**
 * Number schema
 */
class NumberSchema extends SchemaImpl<number> {
    constructor(validators: Array<(value: unknown, path: string) => ValidationErrorDetail[]> = []) {
        super([
            (value, path) => {
                if (typeof value !== "number" || isNaN(value)) {
                    return [{ field: path || "value", message: "Expected number" }];
                }
                return [];
            },
            ...validators,
        ]);
    }

    min(min: number): NumberSchema {
        const newValidators = [
            ...this.getValidators(),
            (value: unknown, path: string) => {
                if (typeof value === "number" && value < min) {
                    return [{ field: path || "value", message: `Number must be at least ${min}` }];
                }
                return [];
            },
        ];
        return new NumberSchema(newValidators.slice(1));
    }

    max(max: number): NumberSchema {
        const newValidators = [
            ...this.getValidators(),
            (value: unknown, path: string) => {
                if (typeof value === "number" && value > max) {
                    return [{ field: path || "value", message: `Number must be at most ${max}` }];
                }
                return [];
            },
        ];
        return new NumberSchema(newValidators.slice(1));
    }

    private getValidators(): Array<(value: unknown, path: string) => ValidationErrorDetail[]> {
        return [];
    }
}

/**
 * Boolean schema
 */
class BooleanSchema extends SchemaImpl<boolean> {
    constructor() {
        super([
            (value, path) => {
                if (typeof value !== "boolean") {
                    return [{ field: path || "value", message: "Expected boolean" }];
                }
                return [];
            },
        ]);
    }
}

/**
 * Array schema
 */
class ArraySchema<T> extends SchemaImpl<T[]> {
    constructor(itemSchema: Schema<T>) {
        super([
            (value, path) => {
                if (!Array.isArray(value)) {
                    return [{ field: path || "value", message: "Expected array" }];
                }

                const errors: ValidationErrorDetail[] = [];
                for (let i = 0; i < value.length; i++) {
                    const result = itemSchema.parse(value[i], `${path || "value"}[${i}]`);
                    if (!result.success && result.errors) {
                        errors.push(...result.errors);
                    }
                }
                return errors;
            },
        ]);
    }
}

/**
 * Object schema
 */
class ObjectSchema<T extends Record<string, Schema<unknown>>> extends SchemaImpl<{ [K in keyof T]: T[K]["_type"] }> {
    constructor(shape: T) {
        super([
            (value, path) => {
                if (value === null || typeof value !== "object" || Array.isArray(value)) {
                    return [{ field: path || "value", message: "Expected object" }];
                }

                const obj = value as Record<string, unknown>;
                const errors: ValidationErrorDetail[] = [];

                for (const [key, schema] of Object.entries(shape)) {
                    const fieldValue = obj[key];
                    const fieldPath = path ? `${path}.${key}` : key;
                    const result = (schema as Schema<unknown>).parse(fieldValue, fieldPath);

                    if (!result.success && result.errors) {
                        errors.push(...result.errors);
                    }
                }

                return errors;
            },
        ]);
    }
}

/**
 * Schema builder namespace
 */
export const v = {
    /**
     * Create a string schema
     */
    string: (): StringSchema => new StringSchema(),

    /**
     * Create a number schema
     */
    number: (): NumberSchema => new NumberSchema(),

    /**
     * Create a boolean schema
     */
    boolean: (): BooleanSchema => new BooleanSchema(),

    /**
     * Create an email schema (string with email validation)
     */
    email: (): StringSchema => new StringSchema().email(),

    /**
     * Create a URL schema (string with URL validation)
     */
    url: (): StringSchema => new StringSchema().url(),

    /**
     * Create a string schema with minimum length
     */
    minLength: (n: number): StringSchema => new StringSchema().minLength(n),

    /**
     * Create a string schema with maximum length
     */
    maxLength: (n: number): StringSchema => new StringSchema().maxLength(n),

    /**
     * Create a number schema with minimum value
     */
    min: (n: number): NumberSchema => new NumberSchema().min(n),

    /**
     * Create a number schema with maximum value
     */
    max: (n: number): NumberSchema => new NumberSchema().max(n),

    /**
     * Create an array schema
     */
    array: <T>(schema: Schema<T>): ArraySchema<T> => new ArraySchema(schema),

    /**
     * Create an object schema
     */
    object: <T extends Record<string, Schema<unknown>>>(shape: T): ObjectSchema<T> => new ObjectSchema(shape),

    /**
     * Make a schema optional
     */
    optional: <T>(schema: Schema<T>): Schema<T | undefined> => schema.optional(),
};

/**
 * Validation target type
 */
export type ValidationTarget = "body" | "query" | "params";

/**
 * Validator configuration
 */
export interface ValidatorConfig {
    body?: Schema<unknown>;
    query?: Schema<unknown>;
    params?: Schema<unknown>;
}

/**
 * Create a validator middleware
 *
 * @example
 * ```typescript
 * const userSchema = v.object({
 *   name: v.string().minLength(1),
 *   email: v.email(),
 *   age: v.number().min(0).optional()
 * });
 *
 * const validateUser = createValidator({ body: userSchema });
 *
 * app.post('/users', validateUser, async (ctx) => {
 *   // ctx.body is now typed as { name: string, email: string, age?: number }
 *   const { name, email, age } = ctx.body as { name: string; email: string; age?: number };
 *   // ...
 * });
 *
 * // Validate query parameters
 * const searchSchema = v.object({
 *   q: v.string().minLength(1),
 *   limit: v.number().max(100).optional()
 * });
 *
 * app.get('/search', createValidator({ query: searchSchema }), handler);
 *
 * // Validate route parameters
 * const paramsSchema = v.object({
 *   id: v.string()
 * });
 *
 * app.get('/users/:id', createValidator({ params: paramsSchema }), handler);
 * ```
 */
export function createValidator(config: ValidatorConfig): Middleware {
    return async (context: RequestContext): Promise<Response | void> => {
        const errors: ValidationErrorDetail[] = [];

        // Cast to validated context for access to params/query
        const ctx = context as ValidatedContext;

        // Validate body
        if (config.body) {
            let body: unknown;
            try {
                body = await context.request.clone().json();
            } catch {
                body = undefined;
            }

            const result = config.body.parse(body, "body");
            if (!result.success && result.errors) {
                errors.push(...result.errors);
            } else if (result.success) {
                ctx.body = result.data;
            }
        }

        // Validate query
        if (config.query) {
            // Convert query string values to appropriate types
            const parsedQuery: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(ctx.query || {})) {
                // Try to parse numbers
                const numValue = Number(value);
                if (!isNaN(numValue) && value === String(numValue)) {
                    parsedQuery[key] = numValue;
                } else if (value === "true") {
                    parsedQuery[key] = true;
                } else if (value === "false") {
                    parsedQuery[key] = false;
                } else {
                    parsedQuery[key] = value;
                }
            }

            const result = config.query.parse(parsedQuery, "query");
            if (!result.success && result.errors) {
                errors.push(...result.errors);
            } else if (result.success) {
                ctx.validatedQuery = result.data;
            }
        }

        // Validate params
        if (config.params) {
            const result = config.params.parse(ctx.params || {}, "params");
            if (!result.success && result.errors) {
                errors.push(...result.errors);
            } else if (result.success) {
                ctx.validatedParams = result.data;
            }
        }

        // Return 422 if validation failed
        if (errors.length > 0) {
            return new Response(
                JSON.stringify({
                    error: "Validation failed",
                    details: errors,
                }),
                {
                    status: 422,
                    headers: { "Content-Type": "application/json" },
                },
            );
        }
    };
}

/**
 * Type helper for extracting validated types from a schema
 */
export type InferSchema<T extends Schema<unknown>> = T["_type"];

export type { Middleware, RequestContext };
