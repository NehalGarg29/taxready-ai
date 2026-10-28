import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Lets tests render React components (e.g. the print report) to static HTML.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
