import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";

import type { RuntimeConfig } from "./runtime-config.js";

export type { OpencodeClient };

export function createOpenCodeClient(config: RuntimeConfig): OpencodeClient {
  return createOpencodeClient({
    baseUrl: config.opencode.baseUrl,
    throwOnError: true,
    responseStyle: "data",
  });
}

export function createScopedOpenCodeClient(
  config: RuntimeConfig,
  directory: string,
): OpencodeClient {
  return createOpencodeClient({
    baseUrl: config.opencode.baseUrl,
    throwOnError: true,
    responseStyle: "data",
    directory,
  });
}
