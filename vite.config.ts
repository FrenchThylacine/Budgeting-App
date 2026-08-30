import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The version, from the one place that has it.
 *
 * `package.json` is the version of record — it is what `npm version` writes
 * and what a release tag matches. Substituting it at build time means the
 * About panel cannot drift from it, and costs the bundle a string.
 */
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/Budgeting-App/" : "/",
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    // Forward API calls to the local Express server so development uses the
    // same store → API → repository → database flow as production.
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Split the dependencies that never change from the code that changes
         * every deploy.
         *
         * Without this everything lands in one 900 kB chunk, so a one-line fix
         * invalidates React, the icon set and the store for every returning
         * visitor. Separated, a deploy re-downloads only the application code
         * and the rest is served from cache.
         *
         * `lucide-react` gets its own chunk because it is the largest single
         * dependency and the one most likely to grow: the icon catalogue is a
         * feature, and it should not sit in the same cache entry as the
         * framework.
         */
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) return "react";
          if (id.includes("zustand")) return "state";
          return undefined;
        },
      },
    },
    // The app chunk is the one worth watching; the vendor chunks are expected
    // to be large and are cached across deploys.
    chunkSizeWarningLimit: 700,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: false,
  },
});
