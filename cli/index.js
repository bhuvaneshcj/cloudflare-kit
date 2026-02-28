#!/usr/bin/env node

/**
 * Cloudflare Kit CLI
 *
 * Simple commands to create, run, and deploy Cloudflare Workers projects.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const command = process.argv[2];
const arg = process.argv[3];

function createProject(name) {
    if (!name) {
        console.error("Please provide a project name: npx cloudflare-kit create my-project");
        process.exit(1);
    }

    console.log(`Creating project: ${name}`);

    // Create directory
    if (fs.existsSync(name)) {
        console.error(`Directory ${name} already exists`);
        process.exit(1);
    }

    fs.mkdirSync(name, { recursive: true });
    fs.mkdirSync(path.join(name, "src"), { recursive: true });

    // Create package.json
    const packageJson = {
        name: name,
        version: "0.1.0",
        private: true,
        scripts: {
            dev: "wrangler dev",
            deploy: "wrangler deploy",
            "db:migrate": "wrangler d1 migrations apply",
        },
        dependencies: {
            "cloudflare-kit": "^0.1.0",
        },
        devDependencies: {
            wrangler: "^3.0.0",
            typescript: "^5.3.0",
        },
    };

    fs.writeFileSync(path.join(name, "package.json"), JSON.stringify(packageJson, null, 2));

    // Create wrangler.toml
    const wranglerToml = `name = "${name}"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
ENVIRONMENT = "development"

[[d1_databases]]
binding = "DB"
database_name = "${name}-db"
database_id = ""

[[kv_namespaces]]
binding = "CACHE"
id = ""

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "${name}-storage"
`;

    fs.writeFileSync(path.join(name, "wrangler.toml"), wranglerToml);

    // Create tsconfig.json
    const tsConfig = {
        compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            lib: ["ES2022"],
            types: ["@cloudflare/workers-types"],
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
        },
        include: ["src/**/*"],
    };

    fs.writeFileSync(path.join(name, "tsconfig.json"), JSON.stringify(tsConfig, null, 2));

    // Create main index.ts
    const indexTs = `import { 
  createApp, 
  createDatabase, 
  createCache, 
  createAuth,
  createLogger,
  jsonResponse,
  errorResponse,
  corsMiddleware,
  jsonMiddleware
} from 'cloudflare-kit';

export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  JWT_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Create services
    const logger = createLogger({ level: 'info', service: '${name}' });
    const database = createDatabase({ binding: env.DB });
    const cache = createCache({ binding: env.CACHE, defaultTTL: 300 });
    const auth = createAuth({ jwtSecret: env.JWT_SECRET });

    // Create app
    const app = createApp({ database, cache, auth, logger });

    // Add middleware
    app.use(corsMiddleware());
    app.use(jsonMiddleware());

    // Routes
    app.get('/', () => {
      return jsonResponse({ 
        message: 'Welcome to ${name}!',
        timestamp: new Date().toISOString()
      });
    });

    app.get('/health', () => {
      return jsonResponse({ status: 'ok' });
    });

    // Handle request
    return app.fetch(request, env, ctx);
  }
};
`;

    fs.writeFileSync(path.join(name, "src", "index.ts"), indexTs);

    console.log("\\n✅ Project created successfully!");
    console.log(`\\nNext steps:`);
    console.log(`  cd ${name}`);
    console.log(`  npm install`);
    console.log(`  npx wrangler login`);
    console.log(`  npm run dev`);
}

function runProject() {
    console.log("Starting development server...");
    try {
        execSync("npx wrangler dev", { stdio: "inherit" });
    } catch (error) {
        console.error("Failed to start dev server. Make sure you have run `npm install` first.");
        process.exit(1);
    }
}

function deployProject() {
    console.log("Deploying to Cloudflare...");
    try {
        execSync("npx wrangler deploy", { stdio: "inherit" });
    } catch (error) {
        console.error("Deployment failed.");
        process.exit(1);
    }
}

function showHelp() {
    console.log(`
Cloudflare Kit CLI

Usage:
  npx cloudflare-kit <command>

Commands:
  create <name>     Create a new project
  run              Run development server (alias: dev)
  deploy           Deploy to Cloudflare
  help             Show this help message

Examples:
  npx cloudflare-kit create my-api
  npx cloudflare-kit run
  npx cloudflare-kit deploy
`);
}

// Main
switch (command) {
    case "create":
        createProject(arg);
        break;
    case "run":
    case "dev":
        runProject();
        break;
    case "deploy":
        deployProject();
        break;
    case "help":
    default:
        showHelp();
        break;
}
