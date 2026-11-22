import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { securityHeadersPlugin } from "./security-headers.js";
export default defineConfig(({ mode }) => ({
  plugins: [react(), securityHeadersPlugin(loadEnv(mode, process.cwd(), "VITE_"))], // writes dist/_headers (CSP, HSTS ...) from the env
  // local dev only: where `npm run dev` forwards /api (set VITE_DEV_API in .env.development; default = local backend)
  server: { proxy: { "/api": loadEnv(mode, process.cwd(), "VITE_").VITE_DEV_API || "http://localhost:5000" } },
  build: {
    target: "es2020",
    sourcemap: false,
    cssMinify: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // vendor code changes rarely, so it stays cached in the browser across deployments
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          http: ["axios"]
        }
      }
    }
  }
}));
