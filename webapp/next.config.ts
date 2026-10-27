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
  // The shared packages live outside this folder (packages/domain-ts and
  // packages/ui-ts, ADR 0007), so the bundler's root is the repository. They
  // have no node_modules of their own: their dependencies resolve from this
  // app's. React needs no alias, Next maps it for every file.
  turbopack: {
    root: path.join(__dirname, ".."),
    resolveAlias: {
      "@khazana/domain": "../packages/domain-ts/src",
      "@khazana/ui": "../packages/ui-ts/src",
      "@khazana/screens": "../packages/screens-ts/src",
      "decimal.js": "./node_modules/decimal.js",
      clsx: "./node_modules/clsx",
      "lucide-react": "./node_modules/lucide-react",
      "framer-motion": "./node_modules/framer-motion",
      zustand: "./node_modules/zustand",
      next: "./node_modules/next",
      exceljs: "./node_modules/exceljs",
      xlsx: "./node_modules/xlsx",
      jspdf: "./node_modules/jspdf",
      "jspdf-autotable": "./node_modules/jspdf-autotable",
    },
  },
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
