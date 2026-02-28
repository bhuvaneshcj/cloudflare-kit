/**
 * Cloudflare Kit - Minimal Example
 *
 * The simplest possible usage. Just 10 lines of code!
 */

import { createApp, jsonResponse, corsMiddleware } from "../src/index";

const app = createApp();

app.use(corsMiddleware());

app.get("/", () => {
    return jsonResponse({ hello: "world" });
});

app.get("/users", () => {
    return jsonResponse({ users: [] });
});

app.post("/users", () => {
    return jsonResponse({ created: true }, 201);
});

// Export for Cloudflare Workers
export default app;
