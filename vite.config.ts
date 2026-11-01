import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Same-origin in dev: the browser talks to /api on this server and cookies just work. API_URL points at the API.
const target = process.env.API_URL ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  server: { port: 3001, proxy: { "/api": { target, changeOrigin: false } } },
  preview: { port: 3001, proxy: { "/api": { target, changeOrigin: false } } },
  test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"] },
});
