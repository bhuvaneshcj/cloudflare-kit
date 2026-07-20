import { describe, it, expect } from "vitest";
import { v } from "../src/validation/index";

describe("validation chaining", () => {
    it("enforces minLength", () => {
        const schema = v.string().minLength(5);
        expect(schema.parse("").success).toBe(false);
        expect(schema.parse("hi").success).toBe(false);
        expect(schema.parse("hello").success).toBe(true);
    });

    it("enforces email", () => {
        const schema = v.email();
        expect(schema.parse("not-an-email").success).toBe(false);
        expect(schema.parse("a@b.com").success).toBe(true);
    });

    it("validates object schemas", () => {
        const schema = v.object({
            name: v.string().minLength(2),
            email: v.email(),
            age: v.number().min(18).optional(),
        });

        expect(schema.parse({ name: "Jo", email: "a@b.com" }).success).toBe(true);
        expect(schema.parse({ name: "J", email: "a@b.com" }).success).toBe(false);
        expect(schema.parse({ name: "Jo", email: "bad" }).success).toBe(false);
    });
});
