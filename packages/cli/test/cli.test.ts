import { describe, expect, it } from "vitest";

import { parseCliArgs } from "../src/cli";

describe("parseCliArgs", () => {
  it("defaults to the start command with runtime-config-driven host and port", () => {
    expect(parseCliArgs([])).toEqual({
      command: "start",
      host: undefined,
      port: undefined,
      here: false,
      help: false,
      version: false,
    });
  });

  it("parses explicit host, port, and command overrides", () => {
    expect(parseCliArgs(["serve", "--host", "127.0.0.1", "--port", "4001"])).toEqual({
      command: "serve",
      host: "127.0.0.1",
      port: 4001,
      here: false,
      help: false,
      version: false,
    });
  });

  it("parses the --here workspace flag", () => {
    expect(parseCliArgs(["start", "--here"])).toEqual({
      command: "start",
      host: undefined,
      port: undefined,
      here: true,
      help: false,
      version: false,
    });
  });

  it("detects help and version flags", () => {
    expect(parseCliArgs(["start", "--help", "--version"])).toEqual({
      command: "start",
      host: undefined,
      port: undefined,
      here: false,
      help: true,
      version: true,
    });
  });
});
