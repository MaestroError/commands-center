import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    root: ".",
    include: ["test/**/*.test.ts"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/db/migrations/**", "src/index.ts"],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      "@test": resolve(import.meta.dirname, "test"),
    },
  },
});
