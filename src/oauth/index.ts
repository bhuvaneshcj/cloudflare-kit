/**
 * OAuth Module
 *
 * Provides OAuth2 authentication support for Google, GitHub, and Discord.
 * No external dependencies - uses fetch() for all HTTP calls.
 */

/**
 * Supported OAuth providers
 */
export type OAuthProvider = "google" | "github" | "discord";

/**
 * OAuth user profile
 */
export interface OAuthUser {
    /** Unique user ID from the provider */
    id: string;
    /** User's email address */
    email: string;
    /** User's display name */
    name: string;
    /** Optional avatar/profile picture URL */
    avatar?: string;
}

/**
 * OAuth token result
 */
export interface TokenResult {
    /** Access token */
    accessToken: string;
    /** Refresh token (if available) */
    refreshToken?: string;
    /** Token expiration time in seconds */
    expiresIn?: number;
    /** Token type (usually "Bearer") */
    tokenType: string;
}

/**
 * OAuth result with user profile
 */
export interface OAuthResult extends TokenResult {
    /** User profile information */
    user: OAuthUser;
}

/**
 * OAuth configuration options
 */
export interface OAuthOptions {
    /** OAuth provider */
    provider: OAuthProvider;
    /** OAuth client ID */
    clientId: string;
    /** OAuth client secret */
    clientSecret: string;
    /** Redirect URI registered with the provider */
    redirectUri: string;
    /** Optional additional scopes */
    scopes?: string[];
}

/**
 * Authorization URL result with PKCE
 */
export interface AuthUrlResult {
    /** The authorization URL to redirect the user to */
    url: string;
    /** PKCE code verifier - must be stored and passed to handleCallback */
    codeVerifier: string;
    /** State parameter for CSRF protection */
    state: string;
}

/**
 * OAuth provider configuration
 */
interface ProviderConfig {
    authorizeUrl: string;
    tokenUrl: string;
    userUrl: string;
    defaultScopes: string[];
    buildUser: (data: Record<string, unknown>) => OAuthUser;
    supportsRefresh: boolean;
}

/**
 * OAuth provider configurations
 */
const providerConfigs: Record<OAuthProvider, ProviderConfig> = {
    google: {
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        userUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
        defaultScopes: ["openid", "email", "profile"],
        buildUser: (data) => ({
            id: String(data.id || data.sub || ""),
            email: String(data.email || ""),
            name: String(data.name || data.displayName || ""),
            avatar: data.picture ? String(data.picture) : undefined,
        }),
        supportsRefresh: true,
    },
    github: {
        authorizeUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        userUrl: "https://api.github.com/user",
        defaultScopes: ["user:email", "read:user"],
        buildUser: (data) => ({
            id: String(data.id || ""),
            email: String(data.email || ""),
            name: String(data.name || data.login || ""),
            avatar: data.avatar_url ? String(data.avatar_url) : undefined,
        }),
        supportsRefresh: false,
    },
    discord: {
        authorizeUrl: "https://discord.com/api/oauth2/authorize",
        tokenUrl: "https://discord.com/api/oauth2/token",
        userUrl: "https://discord.com/api/users/@me",
        defaultScopes: ["identify", "email"],
        buildUser: (data) => ({
            id: String(data.id || ""),
            email: String(data.email || ""),
            name: String(data.global_name || data.username || ""),
            avatar: data.avatar ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png` : undefined,
        }),
        supportsRefresh: true,
    },
};

/**
 * Generate PKCE code verifier (random string)
 */
function generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64URLEncode(array);
}

/**
 * Generate PKCE code challenge from verifier
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return base64URLEncode(new Uint8Array(digest));
}

/**
 * Base64URL encode for PKCE
 */
function base64URLEncode(buffer: Uint8Array): string {
    return btoa(String.fromCharCode(...buffer))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

/**
 * Create an OAuth client for authentication
 *
 * @example
 * ```typescript
 * // Google OAuth
 * const googleOAuth = createOAuth({
 *   provider: 'google',
 *   clientId: env.GOOGLE_CLIENT_ID,
 *   clientSecret: env.GOOGLE_CLIENT_SECRET,
 *   redirectUri: 'https://api.example.com/auth/google/callback',
 *   scopes: ['https://www.googleapis.com/auth/calendar.readonly']
 * });
 *
 * // Step 1: Redirect user to authorization URL
 * app.get('/auth/google', async (ctx) => {
 *   const state = crypto.randomUUID(); // Store this in session/cookie for CSRF protection
 *   await ctx.env.SESSION.put(state, 'valid', { expirationTtl: 600 });
 *
 *   const authUrl = googleOAuth.getAuthUrl(state);
 *   return redirectResponse(authUrl);
 * });
 *
 * // Step 2: Handle callback
 * app.get('/auth/google/callback', async (ctx) => {
 *   const { code, state } = ctx.query;
 *
 *   // Validate state parameter (CSRF protection)
 *   const validState = await ctx.env.SESSION.get(state);
 *   if (!validState) {
 *     return errorResponse('Invalid state parameter', 403);
 *   }
 *   await ctx.env.SESSION.delete(state);
 *
 *   try {
 *     const result = await googleOAuth.handleCallback(code, state);
 *     // result.user: { id, email, name, avatar }
 *     // result.accessToken, result.refreshToken, result.expiresIn
 *
 *     // Create session, set cookie, etc.
 *     return jsonResponse({ user: result.user });
 *   } catch (error) {
 *     return errorResponse('Authentication failed', 400);
 *   }
 * });
 *
 * // Refresh token (Google only)
 * app.post('/auth/refresh', async (ctx) => {
 *   const { refreshToken } = await ctx.request.json();
 *   const result = await googleOAuth.refreshToken(refreshToken);
 *   return jsonResponse(result);
 * });
 * ```
 */
export function createOAuth(options: OAuthOptions) {
    const config = providerConfigs[options.provider];
    const scopes = [...config.defaultScopes, ...(options.scopes || [])];

    /**
     * Generate the authorization URL with PKCE
     *
     * IMPORTANT: You MUST store the returned codeVerifier and pass it to handleCallback()
     */
    async function getAuthUrl(state?: string): Promise<AuthUrlResult> {
        // Generate PKCE parameters
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        const stateParam = state || crypto.randomUUID();

        const params = new URLSearchParams({
            client_id: options.clientId,
            redirect_uri: options.redirectUri,
            response_type: "code",
            scope: scopes.join(" "),
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
            state: stateParam,
        });

        return {
            url: `${config.authorizeUrl}?${params.toString()}`,
            codeVerifier,
            state: stateParam,
        };
    }

    /**
     * Exchange authorization code for tokens and fetch user profile
     *
     * @param code - The authorization code from the callback
     * @param codeVerifier - The PKCE code verifier from getAuthUrl()
     * @param _state - The state parameter for CSRF validation (optional)
     */
    async function handleCallback(code: string, codeVerifier: string, _state?: string): Promise<OAuthResult> {
        // Exchange code for token with PKCE
        const tokenResponse = await fetch(config.tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                client_id: options.clientId,
                client_secret: options.clientSecret,
                redirect_uri: options.redirectUri,
                code_verifier: codeVerifier, // PKCE verification
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorText}`);
        }

        const tokenData = (await tokenResponse.json()) as Record<string, unknown>;

        if (tokenData.error) {
            throw new Error(`Token error: ${tokenData.error}`);
        }

        const accessToken = String(tokenData.access_token || "");
        const refreshToken = tokenData.refresh_token ? String(tokenData.refresh_token) : undefined;
        const expiresIn = typeof tokenData.expires_in === "number" ? tokenData.expires_in : undefined;
        const tokenType = String(tokenData.token_type || "Bearer");

        if (!accessToken) {
            throw new Error("No access token received");
        }

        // Fetch user profile
        const user = await fetchUser(accessToken);

        return {
            accessToken,
            refreshToken,
            expiresIn,
            tokenType,
            user,
        };
    }

    /**
     * Fetch user profile using access token
     */
    async function fetchUser(accessToken: string): Promise<OAuthUser> {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
        };

        // GitHub uses a different header format
        if (options.provider === "github") {
            headers.Authorization = `token ${accessToken}`;
        }

        const userResponse = await fetch(config.userUrl, { headers });

        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            throw new Error(`User fetch failed: ${userResponse.status} - ${errorText}`);
        }

        const userData = (await userResponse.json()) as Record<string, unknown>;

        // For GitHub, we may need to fetch email separately if not public
        if (options.provider === "github" && !userData.email) {
            try {
                const emailsResponse = await fetch("https://api.github.com/user/emails", {
                    headers: {
                        Authorization: `token ${accessToken}`,
                        Accept: "application/vnd.github.v3+json",
                    },
                });

                if (emailsResponse.ok) {
                    const emails = (await emailsResponse.json()) as Array<{
                        email: string;
                        primary: boolean;
                        verified: boolean;
                    }>;
                    const primaryEmail = emails.find((e) => e.primary && e.verified);
                    if (primaryEmail) {
                        userData.email = primaryEmail.email;
                    }
                }
            } catch {
                // Ignore email fetch errors
            }
        }

        return config.buildUser(userData);
    }

    /**
     * Refresh access token (Google and Discord only)
     */
    async function refreshToken(refreshToken: string): Promise<TokenResult> {
        if (!config.supportsRefresh) {
            throw new Error(`${options.provider} does not support token refresh`);
        }

        const response = await fetch(config.tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
                client_id: options.clientId,
                client_secret: options.clientSecret,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
        }

        const data = (await response.json()) as Record<string, unknown>;

        if (data.error) {
            throw new Error(`Refresh error: ${data.error}`);
        }

        return {
            accessToken: String(data.access_token || ""),
            refreshToken: data.refresh_token ? String(data.refresh_token) : refreshToken,
            expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
            tokenType: String(data.token_type || "Bearer"),
        };
    }

    return {
        /**
         * Generate the authorization URL
         */
        getAuthUrl,

        /**
         * Exchange authorization code for tokens and user profile
         */
        handleCallback,

        /**
         * Refresh access token
         */
        refreshToken,
    };
}

/**
 * Create OAuth configuration type
 */
export type OAuthConfig = OAuthOptions;

/**
 * Create OAuth client type
 */
export type OAuthClient = ReturnType<typeof createOAuth>;
