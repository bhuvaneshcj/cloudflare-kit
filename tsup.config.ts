import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: true,
    minify: true,
    treeshake: true,
    outDir: "dist",
    platform: "neutral",
    target: "es2022",
    banner: {
        js: "/*! Cloudflare Kit v1.0.0 | MIT License | github.com/bhuvaneshcj/cloudflare-kit */",
    },
});
