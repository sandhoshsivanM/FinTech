import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Fully static, portable build: emits plain HTML/JS into `out/` with no Node
  // server required. Open it offline, host on any static server, or wrap with
  // Tauri/Electron. Everything here is client-side (IndexedDB + Web Crypto), so
  // static export is a perfect fit.
  output: "export",
  // Emits `dashboard/index.html` rather than `dashboard.html`, so a bare
  // `/dashboard` resolves on any static host that serves directory indexes —
  // and, critically, inside the Tauri app. Without it the root page's
  // `redirect('/dashboard')` lands on a path that has no file behind it and the
  // macOS window opens on "This page couldn't load".
  trailingSlash: true,
  images: { unoptimized: true },
  // The shared domain package lives outside this folder (packages/domain-ts,
  // ADR 0007), so the bundler's root is the repository. It has no
  // node_modules of its own: decimal.js resolves from this app's.
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
