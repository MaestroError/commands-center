import { beforeEach, describe, expect, it, vi } from "vitest";

const { readFileSyncMock } = vi.hoisted(() => ({
  readFileSyncMock: vi.fn(),
}));

vi.mock("node:fs", () => ({
  readFileSync: readFileSyncMock,
}));

import { loadEnvFile } from "../src/env-file.js";

describe("loadEnvFile", () => {
  beforeEach(() => {
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
