import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/Budgeting-App/" : "/",
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
  preview: {
    host: true,
    port: 4173,
    strictPort: false,
  },
});
