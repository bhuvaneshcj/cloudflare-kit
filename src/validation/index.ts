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

type ValidatorFn = (value: unknown, path: string) => ValidationErrorDetail[];

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
        protected validators: ValidatorFn[],
        protected isOptional = false,
    ) {}

    parse(value: unknown, path = ""): ValidationResult<T> {
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
        return new SchemaImpl<T | undefined>(this.validators, true);
    }

    protected getValidators(): ValidatorFn[] {
        return this.validators;
    }
}

/**
 * String schema
 */
class StringSchema extends SchemaImpl<string> {
    constructor(validators: ValidatorFn[] = []) {
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
        return new StringSchema([
            ...this.getValidators().slice(1),
            (value: unknown, path: string) => {
                if (typeof value === "string" && value.length < min) {
                    return [{ field: path || "value", message: `String must be at least ${min} characters` }];
                }
                return [];
            },
        ]);
    }

    maxLength(max: number): StringSchema {
        return new StringSchema([
            ...this.getValidators().slice(1),
            (value: unknown, path: string) => {
                if (typeof value === "string" && value.length > max) {
                    return [{ field: path || "value", message: `String must be at most ${max} characters` }];
                }
                return [];
            },
        ]);
    }

    email(): StringSchema {
        return new StringSchema([
            ...this.getValidators().slice(1),
            (value: unknown, path: string) => {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (typeof value === "string" && !emailRegex.test(value)) {
                    return [{ field: path || "value", message: "Invalid email address" }];
                }
                return [];
            },
        ]);
    }

    url(): StringSchema {
        return new StringSchema([
            ...this.getValidators().slice(1),
            (value: unknown, path: string) => {
                if (typeof value !== "string") return [];
                try {
                    new URL(value);
                    return [];
                } catch {
                    return [{ field: path || "value", message: "Invalid URL" }];
                }
            },
        ]);
    }
}

/**
 * Number schema
 */
class NumberSchema extends SchemaImpl<number> {
    constructor(validators: ValidatorFn[] = []) {
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
        return new NumberSchema([
            ...this.getValidators().slice(1),
            (value: unknown, path: string) => {
                if (typeof value === "number" && value < min) {
                    return [{ field: path || "value", message: `Number must be at least ${min}` }];
                }
                return [];
            },
        ]);
    }

    max(max: number): NumberSchema {
        return new NumberSchema([
            ...this.getValidators().slice(1),
            (value: unknown, path: string) => {
                if (typeof value === "number" && value > max) {
                    return [{ field: path || "value", message: `Number must be at most ${max}` }];
                }
                return [];
            },
        ]);
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
    string: (): StringSchema => new StringSchema(),
    number: (): NumberSchema => new NumberSchema(),
    boolean: (): BooleanSchema => new BooleanSchema(),
    email: (): StringSchema => new StringSchema().email(),
    url: (): StringSchema => new StringSchema().url(),
    minLength: (n: number): StringSchema => new StringSchema().minLength(n),
    maxLength: (n: number): StringSchema => new StringSchema().maxLength(n),
    min: (n: number): NumberSchema => new NumberSchema().min(n),
    max: (n: number): NumberSchema => new NumberSchema().max(n),
    array: <T>(schema: Schema<T>): ArraySchema<T> => new ArraySchema(schema),
    object: <T extends Record<string, Schema<unknown>>>(shape: T): ObjectSchema<T> => new ObjectSchema(shape),
    optional: <T>(schema: Schema<T>): Schema<T | undefined> => schema.optional(),
};

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
 */
export function createValidator(config: ValidatorConfig): Middleware {
    return async (context: RequestContext): Promise<Response | void> => {
        const errors: ValidationErrorDetail[] = [];
        const ctx = context as ValidatedContext;

        if (config.body) {
            let body: unknown = context.state.body;
            if (body === undefined) {
                try {
                    body = await context.request.clone().json();
                } catch {
                    body = undefined;
                }
            }

            const result = config.body.parse(body, "body");
            if (!result.success && result.errors) {
                errors.push(...result.errors);
            } else if (result.success) {
                ctx.body = result.data;
                context.state.body = result.data;
            }
        }

        if (config.query) {
            const parsedQuery: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(ctx.query || {})) {
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

        if (config.params) {
            const result = config.params.parse(ctx.params || {}, "params");
            if (!result.success && result.errors) {
                errors.push(...result.errors);
            } else if (result.success) {
                ctx.validatedParams = result.data;
            }
        }

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

export type InferSchema<T extends Schema<unknown>> = T["_type"];

export type { Middleware, RequestContext };
