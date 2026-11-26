import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
/// <reference types="vitest/config" />
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, "../../frontend");

export default defineConfig({
  base: "/",
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "dev"),
  },
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    // Exact aliases must come before the broad `@` prefix. If `@` wins first,
    // ItemCard imports the web UserProvider and throws outside it.
    alias: [
      { find: /^react$/, replacement: path.resolve(here, "node_modules/react") },
      { find: /^react\/jsx-runtime$/, replacement: path.resolve(here, "node_modules/react/jsx-runtime") },
      { find: /^react-dom$/, replacement: path.resolve(here, "node_modules/react-dom") },
      { find: /^react-dom\/client$/, replacement: path.resolve(here, "node_modules/react-dom/client") },
      { find: "next/link", replacement: path.resolve(here, "src/shims/next-link.tsx") },
      { find: "next/navigation", replacement: path.resolve(here, "src/shims/next-navigation.tsx") },
      { find: "@", replacement: frontend },
    ],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    include: [
      "../../frontend/lib/**/*.test.ts",
      "../../frontend/components/**/*.test.tsx",
    ],
    coverage: {
      provider: "v8",
      allowExternal: true,
      include: [
        "../../frontend/lib/feed-seen.ts",
        "../../frontend/lib/notification-stream.ts",
        "../../frontend/lib/client-errors.ts",
        "../../frontend/lib/view-preference.ts",
        "../../frontend/lib/local-draft.ts",
        "../../frontend/lib/errors.ts",
        "../../frontend/lib/version.ts",
      ],
      reporter: ["text", "json-summary"],
      reportsDirectory: path.resolve(here, "coverage"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    fs: {
      allow: [path.resolve(here, "../.."), frontend],
    },
  },
});
