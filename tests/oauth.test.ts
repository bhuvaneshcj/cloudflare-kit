import { describe, it, expect, vi, afterEach } from "vitest";
import { createOAuth } from "../src/oauth/index";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("createOAuth", () => {
    it("builds authorization URL with PKCE and state", async () => {
        const oauth = createOAuth({
            provider: "google",
            clientId: "client-id",
            clientSecret: "client-secret",
            redirectUri: "https://app.example.com/callback",
        });

        const result = await oauth.getAuthUrl("csrf-state");
        const url = new URL(result.url);

        expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
        expect(url.searchParams.get("client_id")).toBe("client-id");
        expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.com/callback");
        expect(url.searchParams.get("response_type")).toBe("code");
        expect(url.searchParams.get("code_challenge_method")).toBe("S256");
        expect(url.searchParams.get("code_challenge")).toBeTruthy();
        expect(url.searchParams.get("state")).toBe("csrf-state");
        expect(result.codeVerifier.length).toBeGreaterThan(10);
        expect(result.state).toBe("csrf-state");
    });

    it("rejects CSRF when expectedState does not match", async () => {
        const oauth = createOAuth({
            provider: "github",
            clientId: "id",
            clientSecret: "secret",
            redirectUri: "https://app.example.com/callback",
        });

        await expect(oauth.handleCallback("code", "verifier", "got", "expected")).rejects.toThrow(/state/i);
    });

    it("exchanges code and returns user profile", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            const url = String(input);
            if (url.includes("oauth2.googleapis.com/token") || url.includes("googleapis.com/token")) {
                return new Response(
                    JSON.stringify({
                        access_token: "access",
                        refresh_token: "refresh",
                        expires_in: 3600,
                        token_type: "Bearer",
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                );
            }
            if (url.includes("userinfo") || url.includes("oauth2/v2/userinfo")) {
                return new Response(
                    JSON.stringify({
                        id: "u1",
                        email: "ada@example.com",
                        name: "Ada",
                        picture: "https://cdn.example.com/a.png",
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                );
            }
            return new Response("not found", { status: 404 });
        });

        const oauth = createOAuth({
            provider: "google",
            clientId: "id",
            clientSecret: "secret",
            redirectUri: "https://app.example.com/callback",
        });

        const result = await oauth.handleCallback("auth-code", "verifier", "s1", "s1");
        expect(result.accessToken).toBe("access");
        expect(result.refreshToken).toBe("refresh");
        expect(result.user).toEqual({
            id: "u1",
            email: "ada@example.com",
            name: "Ada",
            avatar: "https://cdn.example.com/a.png",
        });
        expect(fetchMock).toHaveBeenCalled();
    });
});
