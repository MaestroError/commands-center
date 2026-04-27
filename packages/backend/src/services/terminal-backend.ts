import type { Logger } from "pino";
import type { TerminalBackend, TerminalBackendType, TerminalSession } from "@cc/shared/schemas";

import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { OpenCodeOrchestrator } from "../orchestrator/opencode-orchestrator.js";
import { createOpenCodePtyBackend } from "./terminal/opencode-pty-backend.js";

export { createOpenCodePtyBackend };

export type TerminalBackendFactory = ReturnType<typeof createTerminalBackendFactory>;

export function createTerminalBackendFactory(options: {
  config: RuntimeConfig;
  logger: Logger;
  orchestrator?: Pick<OpenCodeOrchestrator, "getStatus">;
}) {
  const { config, logger } = options;

  const openCodeBackend = createOpenCodePtyBackend({
    config,
    logger,
    isAvailable: () => options.orchestrator?.getStatus().healthy ?? true,
  });

  function create(type: TerminalBackendType): TerminalBackend {
    switch (type) {
      case "opencode":
        return openCodeBackend;
    }
  }

  async function createWithFallback(options: {
    preferred?: TerminalBackendType;
    cwd?: string;
    shell?: string;
  }): Promise<{ session: TerminalSession; backend: TerminalBackend }> {
    if (!openCodeBackend.isAvailable()) {
      throw new Error("OpenCode terminal backend is unavailable.");
    }

    const session = await openCodeBackend.create({
      cwd: options.cwd,
      shell: options.shell,
    });

    return { session, backend: openCodeBackend };
  }

  function getDefaultBackend(): TerminalBackendType {
    return "opencode";
  }

  function isOpenCodeAvailable(): boolean {
    return openCodeBackend.isAvailable();
  }

  return {
    create,
    createWithFallback,
    getDefaultBackend,
    isOpenCodeAvailable,
    openCodeBackend,
  };
}
