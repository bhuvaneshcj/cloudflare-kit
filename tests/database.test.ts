import { describe, it, expect } from "vitest";
import { validateIdentifier, buildWhereClause } from "../src/database/index";
import { DatabaseError } from "../src/errors/index";

describe("database where builder", () => {
    it("rejects injected identifiers", () => {
        expect(() => validateIdentifier("users; DROP TABLE")).toThrow(DatabaseError);
        expect(() => validateIdentifier("id")).not.toThrow();
    });

    it("builds parameterized AND equality", () => {
        const { clause, params } = buildWhereClause({ id: "1", active: true });
        expect(clause).toBe("id = ? AND active = ?");
        expect(params).toEqual(["1", true]);
    });
});
