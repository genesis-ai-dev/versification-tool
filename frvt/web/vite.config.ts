import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/** Vite build emits static assets into ``dist/`` for FastAPI ``StaticFiles`` mount. */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
