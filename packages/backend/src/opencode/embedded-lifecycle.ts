import type { OpenCodeOrchestrator } from "../orchestrator/opencode-orchestrator.js";
import type { EmbeddedRuntime } from "./embedded-runtime.js";

export function createEmbeddedLifecycle(
  runtime: EmbeddedRuntime,
  workspaceDir: string,
): OpenCodeOrchestrator {
  const startedAt = new Date().toISOString();
  return {
    start: () => Promise.resolve(),
    stop: () => runtime.close(),
    restart: () => runtime.reload(),
    refreshHealth: () => Promise.resolve(runtime.getStatus().healthy),
    getStatus() {
      const status = runtime.getStatus();
      return {
        state:
          status.state === "closed"
            ? "stopped"
            : status.state === "closing"
              ? "stopping"
              : status.state === "reloading"
                ? "starting"
                : status.state,
        healthy: status.healthy,
        url: "embedded://local",
        workspaceDir,
        startedAt,
        restartCount: 0,
        maxRestarts: 0,
      };
    },
  };
}
