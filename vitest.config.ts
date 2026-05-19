import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    // Default environment for client-side tests
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // Project-based config: client tests use jsdom, api/** tests use node
    projects: [
      {
        test: {
          name: "client",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts", "tests/**/*.test.tsx"],
          exclude: ["tests/api/**", "api/**"],
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          globals: true,
        },
        plugins: [react()],
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "./src"),
          },
        },
      },
      {
        test: {
          name: "api",
          include: ["api/**/*.test.ts", "tests/api/**/*.test.ts", "tests/integration/**/*.test.ts"],
          environment: "node",
          setupFiles: ["./vitest.setup.ts"],
          globals: true,
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
