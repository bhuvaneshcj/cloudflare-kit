import { describe, it, expect } from "vitest";
import { createStorage, verifySignedUploadToken } from "../src/storage/index";

function mockBucket(): R2Bucket {
    return {
        head: async () => null,
        get: async () => null,
        put: async () => ({}) as R2Object,
        delete: async () => undefined,
        list: async () => ({ objects: [], truncated: false, delimitedPrefixes: [] }),
        createMultipartUpload: async () => ({}) as R2MultipartUpload,
        resumeMultipartUpload: () => ({}) as R2MultipartUpload,
    } as unknown as R2Bucket;
}

describe("signed upload URLs", () => {
    it("rejects create without signing secret", async () => {
        const storage = createStorage({ binding: mockBucket() });
        await expect(storage.createSignedUploadUrl("file.pdf")).rejects.toThrow(/signingSecret/);
    });

    it("verifies HMAC tokens and rejects forgeries", async () => {
        const secret = "signing-secret-16+";
        const storage = createStorage({
            binding: mockBucket(),
            signingSecret: secret,
        });

        const signed = await storage.createSignedUploadUrl("file.pdf", { expiration: 60 });
        expect(signed.token).toContain(".");

        const ok = await verifySignedUploadToken(signed.token, secret);
        expect(ok?.key).toBe("file.pdf");

        const forged = await verifySignedUploadToken(signed.token.replace(/\./, ".x"), secret);
        expect(forged).toBeNull();

        const viaService = await storage.verifySignedUploadToken(signed.token);
        expect(viaService?.key).toBe("file.pdf");
    });
});
