import { describe, expect, it } from "vitest";

import { createLogger, createServer, loadRuntimeConfig } from "@cc/backend";

describe("createServer", () => {
  it("returns health information for the bootstrapped runtime", async () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
      },
    });
    const server = await createServer({
      config,
      logger: createLogger(config),
    });

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/health",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: "ok",
        dataDir: "/tmp/project/.cc",
        workspaceDir: "/tmp/project/.cc/workspace",
      });
    } finally {
      await server.close();
    }
  });

  it("propagates request correlation ids", async () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
      },
    });
    const server = await createServer({
      config,
      logger: createLogger(config),
    });

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/health",
        headers: {
          "x-request-id": "req-123",
        },
      });

      expect(response.headers["x-request-id"]).toBe("req-123");
    } finally {
      await server.close();
    }
  });
});
