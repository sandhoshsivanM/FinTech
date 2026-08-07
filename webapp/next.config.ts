import type { NextConfig } from "next";

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
};

export default nextConfig;
