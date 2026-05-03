import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { randomBytes } from "node:crypto";

import type { RuntimeConfig } from "../../lib/runtime-config.js";

const AUTH_STATE_FILE = "cc-managed-mcp.json";

type AuthState = {
  signingSecret: string;
};

const stateCache = new Map<string, Promise<AuthState>>();

export function createCcManagedMcpAuthStateStore(config: RuntimeConfig) {
  const filePath = join(config.paths.subdirectories.auth, AUTH_STATE_FILE);

  return {
    async load(): Promise<AuthState> {
      const cached = stateCache.get(filePath);

      if (cached) {
        return cached;
      }

      const loading = loadAuthState(filePath, config.paths.subdirectories.auth);
      stateCache.set(filePath, loading);
      return loading;
    },
  };
}

async function loadAuthState(filePath: string, authDir: string): Promise<AuthState> {
  await mkdir(authDir, { recursive: true });

  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<AuthState>;

    if (typeof parsed.signingSecret === "string" && parsed.signingSecret.length > 0) {
      return { signingSecret: parsed.signingSecret };
    }
  } catch {
    // Ignore missing or malformed state and rewrite below.
  }

  const state = { signingSecret: randomBytes(32).toString("hex") } satisfies AuthState;
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return state;
}

export type CcManagedMcpAuthStateStore = ReturnType<typeof createCcManagedMcpAuthStateStore>;
