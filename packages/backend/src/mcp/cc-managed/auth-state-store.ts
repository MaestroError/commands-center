import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { randomBytes } from "node:crypto";

import type { RuntimeConfig } from "../../lib/runtime-config.js";

const AUTH_STATE_FILE = "cc-managed-mcp.json";

type AuthState = {
  signingSecret: string;
};

export function createCcManagedMcpAuthStateStore(config: RuntimeConfig) {
  const filePath = join(config.paths.subdirectories.auth, AUTH_STATE_FILE);
  let cached: AuthState | undefined;

  return {
    async load(): Promise<AuthState> {
      if (cached) {
        return cached;
      }

      await mkdir(config.paths.subdirectories.auth, { recursive: true });

      try {
        const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<AuthState>;

        if (typeof parsed.signingSecret === "string" && parsed.signingSecret.length > 0) {
          cached = { signingSecret: parsed.signingSecret };
          return cached;
        }
      } catch {
        // Ignore missing or malformed state and rewrite below.
      }

      cached = { signingSecret: randomBytes(32).toString("hex") };
      await writeFile(filePath, `${JSON.stringify(cached, null, 2)}\n`, "utf8");
      return cached;
    },
  };
}

export type CcManagedMcpAuthStateStore = ReturnType<typeof createCcManagedMcpAuthStateStore>;
