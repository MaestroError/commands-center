import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/test-setup.ts",
        "src/components/ui/**",
        // Dev-only debug panel; lazy-loaded solely under import.meta.env.DEV and
        // never shipped to production, so it is intentionally left untested.
        "src/components/dev/DevDebugPanel.tsx",
        // Heavy Milkdown WYSIWYG editor and its lazy Suspense wrapper. The editor
        // is a thin binding over the third-party @milkdown/crepe runtime that does
        // not render meaningfully under jsdom; it is validated via e2e instead.
        "src/components/documents/MilkdownDocumentEditor.tsx",
        "src/components/documents/LazyMilkdownEditor.tsx",
        // Lazy Suspense wrapper around GlobalTerminalPage — pure code-splitting glue.
        "src/pages/LazyGlobalTerminalPage.tsx",
      ],
      // Coverage gate, ratcheted up after a page-level flow-test push (was 80/70/75/75).
      // Statements/functions/lines are held at the 85 target; branches is set to 77 —
      // the current floor (77.9%) — as a stepping stone toward the 80% goal. Raise the
      // branch gate to 80 once the remaining TasksPage/IntegrationsPage edge branches
      // are covered.
      thresholds: {
        statements: 85,
        branches: 77,
        functions: 85,
        lines: 85,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
});
