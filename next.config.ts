import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Keep the MapLibre bundle out of the server graph.
    optimizePackageImports: ["maplibre-gl"],
  },
};

export default nextConfig;
