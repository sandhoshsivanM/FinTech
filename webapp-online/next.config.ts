import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Static export, like the offline app: no Node server. Everything talks to
  // the gateway from the browser (CORS allow-list, Gateway:AllowedOrigins).
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Shared packages live in packages/ (ADR 0007), outside this folder, so the
  // bundler's root is the repository. Their dependencies resolve from this
  // app's node_modules. React needs no alias, Next maps it for every file.
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
