import type { DestinationStream } from "pino";
import { describe, expect, it } from "vitest";

import { createLogger } from "../../src/lib/logger";
import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import { redactSensitiveQuery, redactSensitiveUrl } from "../../src/lib/url-redaction";

describe("URL redaction", () => {
  it("redacts public MCP URL key values", () => {
    expect(redactSensitiveUrl("/api/public/mcp?key=cc_secret&foo=bar")).toBe(
      "/api/public/mcp?key=redacted&foo=bar",
    );
  });

  it("leaves public REST URL key values untouched", () => {
    expect(redactSensitiveUrl("/api/public/v1/tasks?key=cc_secret")).toBe(
      "/api/public/v1/tasks?key=cc_secret",
    );
  });

  it("redacts key values from serialized request query objects", () => {
    expect(redactSensitiveQuery({ key: "cc_secret", foo: "bar" })).toEqual({
      key: "redacted",
      foo: "bar",
    });
  });

  it("redacts public MCP URL key values in request logs", () => {
    const lines: string[] = [];
    const logger = createLogger(
      loadRuntimeConfig({
        cwd: "/tmp",
        env: { NODE_ENV: "production", CC_LOG_LEVEL: "info" },
      }),
      {
        write(chunk: string) {
          lines.push(chunk);
          return true;
        },
      } satisfies DestinationStream,
    );

    logger.info(
      {
        req: {
          method: "POST",
          url: "/api/public/mcp?key=cc_secret_token_value&foo=bar",
          query: { key: "cc_secret_token_value", foo: "bar" },
          headers: { host: "localhost" },
          socket: { remoteAddress: "127.0.0.1", remotePort: 1234 },
        },
      },
      "request completed",
    );

    const output = lines.join("");
    expect(output).not.toContain("cc_secret_token_value");
    expect(output).toContain("/api/public/mcp?key=redacted&foo=bar");
    expect(output).toContain('"key":"redacted"');
  });
});
