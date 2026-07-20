import { describe, it, expect } from "vitest";
import { createCache } from "../src/cache/index";
import { createMockKV } from "../src/testing/index";

describe("createCache", () => {
    it("sets and gets JSON values", async () => {
        const kv = createMockKV();
        const cache = createCache({ binding: kv as never, defaultTTL: 60 });

        await cache.set("user:1", { id: 1, name: "Ada" });
        expect(await cache.get("user:1")).toEqual({ id: 1, name: "Ada" });
        expect(await cache.has("user:1")).toBe(true);
    });

    it("supports string get/set and delete", async () => {
        const kv = createMockKV();
        const cache = createCache({ binding: kv as never });

        await cache.setString("token", "abc");
        expect(await cache.getString("token")).toBe("abc");
        await cache.delete("token");
        expect(await cache.has("token")).toBe(false);
    });

    it("getOrSet computes once and caches", async () => {
        const kv = createMockKV();
        const cache = createCache({ binding: kv as never });
        let calls = 0;

        const first = await cache.getOrSet("expensive", async () => {
            calls++;
            return { n: 42 };
        });
        const second = await cache.getOrSet("expensive", async () => {
            calls++;
            return { n: 99 };
        });

        expect(first).toEqual({ n: 42 });
        expect(second).toEqual({ n: 42 });
        expect(calls).toBe(1);
    });

    it("supports getMany / setMany", async () => {
        const kv = createMockKV();
        const cache = createCache({ binding: kv as never });

        await cache.setMany({ a: 1, b: 2 });
        const values = await cache.getMany(["a", "b", "missing"]);
        expect(values).toEqual({ a: 1, b: 2 });
        expect(values).not.toHaveProperty("missing");
    });

    it("invalidates keys by tag", async () => {
        const kv = createMockKV();
        const cache = createCache({ binding: kv as never });

        await cache.setWithTags("user:1", { id: 1 }, ["users"]);
        await cache.setWithTags("user:2", { id: 2 }, ["users"]);
        expect(await cache.get("user:1")).toEqual({ id: 1 });

        await cache.invalidateByTag("users");
        expect(await cache.get("user:1")).toBeNull();
        expect(await cache.get("user:2")).toBeNull();
    });

    it("lists keys by prefix", async () => {
        const kv = createMockKV();
        const cache = createCache({ binding: kv as never });
        await cache.set("user:1", 1);
        await cache.set("user:2", 2);
        await cache.set("post:1", 1);

        const listed = await cache.listKeys({ prefix: "user:" });
        expect(listed.keys.sort()).toEqual(["user:1", "user:2"]);
    });
});
