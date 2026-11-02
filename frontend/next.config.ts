import type { NextConfig } from "next";

// The browser talks to Next only: API, health and media requests are proxied
// to the Rust server, so cookies stay first-party and no CORS setup is needed.
const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8080";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      // Health probes live outside /api on the server.
      {
        source: "/health",
        destination: `${backendUrl}/health`,
      },
      {
        source: "/health/ready",
        destination: `${backendUrl}/health/ready`,
      },
      // Covers and avatars are served by the API as well.
      {
        source: "/media/:path*",
        destination: `${backendUrl}/media/:path*`,
      },
    ];
  },
};

export default nextConfig;
