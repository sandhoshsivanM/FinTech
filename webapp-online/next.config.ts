import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Static export, like the offline app: no Node server. Everything talks to
  // the gateway from the browser (CORS allow-list, Gateway:AllowedOrigins).
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Shared domain package and tokens live in packages/domain-ts (ADR 0007),
  // outside this folder, so the bundler's root is the repository. decimal.js
  // resolves from this app's node_modules.
  turbopack: {
    root: path.join(__dirname, ".."),
    resolveAlias: {
      "@khazana/domain": "../packages/domain-ts/src",
      "decimal.js": "./node_modules/decimal.js",
    },
  },
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
