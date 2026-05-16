import { beforeEach, describe, expect, it, vi } from "vitest";

const { existsSyncMock, readFileSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
}));

import { loadDefaultEnvFile, loadEnvFile } from "../../src/lib/env-file";

describe("loadEnvFile", () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    readFileSyncMock.mockReset();
  });

  it("loads env values while skipping comments, malformed lines, and existing keys", () => {
    readFileSyncMock.mockReturnValue(`
# comment
API_KEY="secret"
EMPTY=
NO_SEPARATOR
EXISTING=from-file
  TRIMMED =  spaced value  
'BROKEN'=ignored
`);

    const env = {
      EXISTING: "already-set",
    } as NodeJS.ProcessEnv;

    loadEnvFile("./.env", env);

    expect(readFileSyncMock).toHaveBeenCalledWith(expect.stringMatching(/\.env$/), "utf8");
    expect(env).toMatchObject({
      API_KEY: "secret",
      EMPTY: "",
      EXISTING: "already-set",
      TRIMMED: "spaced value",
      "'BROKEN'": "ignored",
    });
  });

  it("removes matching single and double quotes from values", () => {
    readFileSyncMock.mockReturnValue(
      ["SINGLE='hello'", 'DOUBLE="world"', "PLAIN=value"].join("\n"),
    );

    const env = {} as NodeJS.ProcessEnv;

    loadEnvFile("./.env", env);

    expect(env).toEqual({
      SINGLE: "hello",
      DOUBLE: "world",
      PLAIN: "value",
    });
  });
});

describe("loadDefaultEnvFile", () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    readFileSyncMock.mockReset();
  });

  it("loads the .env file from INIT_CWD", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue("CC_WORKSPACE_DIR=/tmp/workspace\n");
    const env = { INIT_CWD: "/workspace" } as NodeJS.ProcessEnv;

    const loaded = loadDefaultEnvFile({ env });

    expect(loaded).toBe("/workspace/.env");
    expect(env["CC_WORKSPACE_DIR"]).toBe("/tmp/workspace");
  });

  it("returns undefined when the default .env file does not exist", () => {
    existsSyncMock.mockReturnValue(false);
    const env = { INIT_CWD: "/workspace" } as NodeJS.ProcessEnv;

    expect(loadDefaultEnvFile({ env })).toBeUndefined();
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });
});
