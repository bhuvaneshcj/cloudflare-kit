/**
 * Cloudflare Kit - Basic Usage Example
 *
 * This example shows how to use all the main features of cloudflare-kit
 * in a simple, beginner-friendly way.
 */

import {
    createApp,
    createAuth,
    createDatabase,
    createCache,
    createStorage,
    createQueue,
    createLogger,
    jsonResponse,
    errorResponse,
    successResponse,
    corsMiddleware,
    jsonMiddleware,
    rateLimit,
    validateRequest,
} from "../src/index";

// Define your environment bindings
export interface Env {
    DB: D1Database;
    CACHE: KVNamespace;
    STORAGE: R2Bucket;
    QUEUE: Queue;
    JWT_SECRET: string;
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // ==========================================
        // 1. Create Logger
        // ==========================================
        const logger = createLogger({
            level: "info",
            service: "my-api",
            environment: "production",
        });

        logger.info("Request started", {
            method: request.method,
            url: request.url,
        });

        // ==========================================
        // 2. Create Services
        // ==========================================
        const database = createDatabase({ binding: env.DB });
        const cache = createCache({ binding: env.CACHE, defaultTTL: 300 });
        const storage = createStorage({ binding: env.STORAGE });
        const queue = createQueue({ binding: env.QUEUE });
        const auth = createAuth({
            jwtSecret: env.JWT_SECRET,
            database: database,
        });

        // ==========================================
        // 3. Create App with Services
        // ==========================================
        const app = createApp({
            database,
            cache,
            storage,
            queue,
            auth,
            logger,
        });

        // ==========================================
        // 4. Add Middleware
        // ==========================================
        app.use(corsMiddleware());
        app.use(jsonMiddleware());
        app.use(rateLimit({ maxRequests: 100, windowSeconds: 60 }));

        // ==========================================
        // 5. Define Routes
        // ==========================================

        // Home route
        app.get("/", () => {
            return jsonResponse({
                message: "Welcome to Cloudflare Kit!",
                timestamp: new Date().toISOString(),
            });
        });

        // Health check
        app.get("/health", () => {
            return jsonResponse({ status: "ok" });
        });

        // User registration
        app.post(
            "/register",
            validateRequest({
                email: { type: "email", required: true },
                password: { type: "string", required: true, minLength: 8 },
            }),
            async (context) => {
                const { email, password } = context.state.body as { email: string; password: string };

                // Check if user exists
                const existingUser = await database.get("SELECT id FROM users WHERE email = ?", [email]);

                if (existingUser) {
                    return errorResponse("User already exists", 409);
                }

                // Create user
                const userId = crypto.randomUUID();
                await database.execute(
                    "INSERT INTO users (id, email, password) VALUES (?, ?, ?)",
                    [userId, email, password], // Note: Hash password in production!
                );

                // Create token
                const result = await auth.createToken({ id: userId, email });

                if (!result.success) {
                    return errorResponse(result.error || "Failed to create token", 500);
                }

                logger.info("User registered", { userId, email });

                return jsonResponse(
                    {
                        user: { id: userId, email },
                        token: result.token,
                    },
                    201,
                );
            },
        );

        // User login
        app.post("/login", async (context) => {
            const { email, password } = context.state.body as { email: string; password: string };

            // Find user
            const user = await database.get<{ id: string; email: string; password: string }>(
                "SELECT id, email, password FROM users WHERE email = ?",
                [email],
            );

            if (!user || user.password !== password) {
                // Note: Use proper password comparison!
                return errorResponse("Invalid credentials", 401);
            }

            // Create token
            const result = await auth.createToken({ id: user.id, email: user.email });

            if (!result.success) {
                return errorResponse(result.error || "Failed to create token", 500);
            }

            logger.info("User logged in", { userId: user.id });

            return jsonResponse({
                user: { id: user.id, email: user.email },
                token: result.token,
            });
        });

        // Get current user (protected)
        app.get("/me", async (context) => {
            const authResult = await auth.verifyToken(context.request.headers.get("Authorization"));

            if (!authResult.success) {
                return errorResponse(authResult.error || "Unauthorized", 401);
            }

            return jsonResponse({ user: authResult.user });
        });

        // Get users with caching
        app.get("/users", async () => {
            // Try cache first
            const cached = await cache.get("users:all");
            if (cached) {
                logger.debug("Returning cached users");
                return jsonResponse({ users: cached, cached: true });
            }

            // Get from database
            const result = await database.query("SELECT id, email, created_at FROM users LIMIT 100");

            // Cache for 5 minutes
            await cache.set("users:all", result.results, 300);

            return jsonResponse({ users: result.results });
        });

        // Upload file
        app.post("/upload", async (context) => {
            const formData = await context.request.formData();
            const file = formData.get("file") as File;

            if (!file) {
                return errorResponse("No file provided", 400);
            }

            const key = `uploads/${crypto.randomUUID()}-${file.name}`;
            const result = await storage.upload(key, await file.arrayBuffer(), {
                contentType: file.type,
                customMetadata: { originalName: file.name },
            });

            if (!result.success) {
                return errorResponse(result.error || "Upload failed", 500);
            }

            return jsonResponse(
                {
                    key: result.key,
                    size: result.size,
                    etag: result.etag,
                },
                201,
            );
        });

        // Download file
        app.get("/download/:key", async (context) => {
            const key = context.url.pathname.split("/").pop();

            if (!key) {
                return errorResponse("No key provided", 400);
            }

            const result = await storage.download(key);

            if (!result.success) {
                return errorResponse(result.error || "File not found", 404);
            }

            return new Response(result.data, {
                headers: {
                    "Content-Type": result.contentType || "application/octet-stream",
                },
            });
        });

        // Queue message
        app.post("/send-email", async (context) => {
            const { to, subject, body } = context.state.body as {
                to: string;
                subject: string;
                body: string;
            };

            const result = await queue.send({
                type: "send-email",
                to,
                subject,
                body,
                timestamp: Date.now(),
            });

            if (!result.success) {
                return errorResponse(result.error || "Failed to queue email", 500);
            }

            return successResponse("Email queued successfully");
        });

        // Delete user
        app.delete("/users/:id", async (context) => {
            const id = context.url.pathname.split("/").pop();

            if (!id) {
                return errorResponse("No user ID provided", 400);
            }

            const changes = await database.delete("users", "id = ?", [id]);

            if (changes === 0) {
                return errorResponse("User not found", 404);
            }

            // Clear cache
            await cache.delete("users:all");

            return successResponse("User deleted");
        });

        // ==========================================
        // 6. Handle Request
        // ==========================================
        return app.fetch(request, env, ctx);
    },
};
