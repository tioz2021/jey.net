import type { NextConfig } from "next";

// The browser talks to Next only: API, health and media requests are proxied
// to the Rust server, so cookies stay first-party and no CORS setup is needed.
const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8080";

const nextConfig: NextConfig = {
  // The production server ships as a self-contained bundle: node server.js.
  output: "standalone",

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
      // SPA shadow route. Only page URLs are rewritten; /spa/assets stays static.
      { source: "/spa/items/:path*", destination: "/spa/index.html" },
      { source: "/spa/collections/:path*", destination: "/spa/index.html" },
      { source: "/spa/feed", destination: "/spa/index.html" },
      { source: "/spa/recommendations", destination: "/spa/index.html" },
      { source: "/spa/people", destination: "/spa/index.html" },
      { source: "/spa/notifications", destination: "/spa/index.html" },
      { source: "/spa/dashboard", destination: "/spa/index.html" },
      { source: "/spa/trash", destination: "/spa/index.html" },
      { source: "/spa/reports", destination: "/spa/index.html" },
      { source: "/spa/analytics", destination: "/spa/index.html" },
      { source: "/spa/login", destination: "/spa/index.html" },
      { source: "/spa/privacy", destination: "/spa/index.html" },
      { source: "/spa/terms", destination: "/spa/index.html" },
      { source: "/spa/admin", destination: "/spa/index.html" },
      { source: "/spa", destination: "/spa/index.html" },
      // Covers and avatars are served by the API as well.
      {
        source: "/media/:path*",
        destination: `${backendUrl}/media/:path*`,
      },
    ];
  },
};

export default nextConfig;
