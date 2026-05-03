import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    root: ".",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/types/index.ts"],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
});
