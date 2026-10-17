import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./packages/frontend/e2e/embedded",
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4176",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm --filter @cc/backend exec tsx test/e2e/embedded-server.ts",
    url: "http://127.0.0.1:4176/login",
    reuseExistingServer: false,
    timeout: 120000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15000 },
  },
});
