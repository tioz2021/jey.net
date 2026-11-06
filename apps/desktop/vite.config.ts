import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, "../../frontend");

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: "@", replacement: frontend },
      { find: "next/link", replacement: path.resolve(here, "src/shims/next-link.tsx") },
      { find: "@/lib/user-context", replacement: path.resolve(here, "src/shims/user-context.tsx") },
      { find: "next/navigation", replacement: path.resolve(here, "src/shims/next-navigation.tsx") },
    ],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 1420,
    strictPort: true,
  },
});
