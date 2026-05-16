import { describe, expect, it } from "vitest";

import { parseCliArgs } from "../src/cli";

describe("parseCliArgs", () => {
  it("defaults to the start command with runtime-config-driven host and port", () => {
    expect(parseCliArgs([])).toEqual({
      command: "start",
      host: undefined,
      port: undefined,
      envFile: undefined,
      help: false,
      version: false,
      rollback: false,
      yes: false,
    });
  });

  it("parses explicit host, port, and command overrides", () => {
    expect(
      parseCliArgs([
        "serve",
        "--host",
        "127.0.0.1",
        "--port",
        "4001",
        "--cc-env-file",
        "/opt/cc/.env",
      ]),
    ).toEqual({
      command: "serve",
      host: "127.0.0.1",
      port: 4001,
      envFile: "/opt/cc/.env",
      help: false,
      version: false,
      rollback: false,
      yes: false,
    });
  });

  it("parses the upgrade rollback command", () => {
    expect(parseCliArgs(["upgrade", "--rollback"])).toEqual({
      command: "upgrade",
      host: undefined,
      port: undefined,
      envFile: undefined,
      help: false,
      version: false,
      rollback: true,
      yes: false,
    });
  });

  it("parses claim confirmation", () => {
    expect(parseCliArgs(["claim", "--yes"])).toEqual({
      command: "claim",
      host: undefined,
      port: undefined,
      envFile: undefined,
      help: false,
      version: false,
      rollback: false,
      yes: true,
    });
  });

  it("detects help and version flags", () => {
    expect(parseCliArgs(["start", "--help", "--version"])).toEqual({
      command: "start",
      host: undefined,
      port: undefined,
      envFile: undefined,
      help: true,
      version: true,
      rollback: false,
      yes: false,
    });
  });

  it("ignores option flags that are missing trailing values", () => {
    expect(parseCliArgs(["serve", "--host"])).toEqual({
      command: "serve",
      host: undefined,
      port: undefined,
      envFile: undefined,
      help: false,
      version: false,
      rollback: false,
      yes: false,
    });

    expect(parseCliArgs(["serve", "--port"])).toEqual({
      command: "serve",
      host: undefined,
      port: undefined,
      envFile: undefined,
      help: false,
      version: false,
      rollback: false,
      yes: false,
    });

    expect(parseCliArgs(["serve", "--cc-env-file"])).toEqual({
      command: "serve",
      host: undefined,
      port: undefined,
      envFile: undefined,
      help: false,
      version: false,
      rollback: false,
      yes: false,
    });
  });

  it("accepts the legacy env-file flag for compatibility", () => {
    expect(parseCliArgs(["serve", "--env-file", "/opt/cc/.env"])).toEqual({
      command: "serve",
      host: undefined,
      port: undefined,
      envFile: "/opt/cc/.env",
      help: false,
      version: false,
      rollback: false,
      yes: false,
    });
  });
});
