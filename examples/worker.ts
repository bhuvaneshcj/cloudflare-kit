/**
 * Verified example worker using cloudflare-kit 3.0 public APIs.
 * Typecheck: npx tsc --noEmit -p examples/tsconfig.json (optional)
 */
import {
    createApp,
    createAuth,
    requireAuth,
    corsMiddleware,
    jsonMiddleware,
    securityHeadersMiddleware,
    createValidator,
    v,
    jsonResponse,
    errorResponse,
    createLogger,
} from "../src/index";

interface Env {
    JWT_SECRET: string;
}

const logger = createLogger({ level: "info", service: "example" });
const auth = createAuth({ secret: "development-secret-at-least-32-chars!!" });

const app = createApp<Env>({
    trailingSlash: "ignore",
    onError: (error) => {
        console.error(error);
        return errorResponse("Internal Server Error", 500);
    },
});

app.use(corsMiddleware({ origin: ["https://example.com"], credentials: true, maxAge: 600 }));
app.use(jsonMiddleware({ maxSize: 1024 * 100 }));
app.use(securityHeadersMiddleware());
app.use(logger.requestLogger());

app.get("/health", () => jsonResponse({ status: "ok" }));

app.post(
    "/echo",
    createValidator({
        body: v.object({
            message: v.string().minLength(1).maxLength(200),
            tag: v.string().enum(["a", "b"]).optional(),
        }),
    }),
    (ctx) => jsonResponse({ body: ctx.state.body }),
);

app.get("/me", requireAuth(auth), (ctx) => jsonResponse({ user: ctx.state.user }));

export default app;
