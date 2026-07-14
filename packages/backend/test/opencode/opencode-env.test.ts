import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildOpenCodeStateEnv, ensureOpenCodeStateDirs } from "../../src/opencode/opencode-env";

describe("buildOpenCodeStateEnv", () => {
  it("returns an empty object when stateDir is undefined", () => {
    expect(buildOpenCodeStateEnv(undefined)).toEqual({});
  });

  it("maps each XDG base directory under the state dir", () => {
    expect(buildOpenCodeStateEnv("/workspace/.cc/opencode")).toEqual({
      XDG_DATA_HOME: "/workspace/.cc/opencode/data",
      XDG_CONFIG_HOME: "/workspace/.cc/opencode/config",
      XDG_CACHE_HOME: "/workspace/.cc/opencode/cache",
      XDG_STATE_HOME: "/workspace/.cc/opencode/state",
    });
  });

  it("wins over ambient XDG_* values when spread last into an environment", () => {
    const ambient = {
      HOME: "/home/node",
      XDG_DATA_HOME: "/home/node/.local/share",
      XDG_CONFIG_HOME: "/home/node/.config",
    };

    const merged = { ...ambient, ...buildOpenCodeStateEnv("/workspace/.cc/opencode") };

    expect(merged.XDG_DATA_HOME).toBe("/workspace/.cc/opencode/data");
    expect(merged.XDG_CONFIG_HOME).toBe("/workspace/.cc/opencode/config");
    // Untouched ambient values remain.
    expect(merged.HOME).toBe("/home/node");
  });
});

describe("ensureOpenCodeStateDirs", () => {
  it("does nothing when stateDir is undefined", async () => {
    await expect(ensureOpenCodeStateDirs(undefined)).resolves.toBeUndefined();
  });

  it("creates the four XDG root directories under the state dir", async () => {
    const root = await mkdtemp(join(tmpdir(), "cc-opencode-state-"));
    const stateDir = join(root, "opencode");

    try {
      await ensureOpenCodeStateDirs(stateDir);

      for (const sub of ["data", "config", "cache", "state"]) {
        await expect(stat(join(stateDir, sub))).resolves.toBeDefined();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
