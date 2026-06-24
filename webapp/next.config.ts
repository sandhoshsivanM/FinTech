import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static, portable build: emits plain HTML/JS into `out/` with no Node
  // server required. Open it offline, host on any static server, or wrap with
  // Tauri/Electron. Everything here is client-side (IndexedDB + Web Crypto), so
  // static export is a perfect fit.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
