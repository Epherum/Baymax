import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // Allow Electron packaging without blocking on TS checks; keep linting via biome.
    ignoreBuildErrors: true
  }
};

export default nextConfig;
