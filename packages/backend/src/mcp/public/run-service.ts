import type { McpTaskRunResult, TaskRun, TaskRunStatus } from "@cc/shared/schemas";

import type { TaskService } from "../../services/task-service.js";

const TERMINAL_STATUSES: ReadonlySet<TaskRunStatus> = new Set([
  "completed",
  "failed",
  "error",
  "cancelled",
  "skipped",
]);

// Phase 2 uses a fixed, conservative bounded wait. Phase 4 replaces the cap with
// a settings-driven value and adds the async variants.
export const DEFAULT_SYNC_WAIT_CAP_MS = 60_000;
export const DEFAULT_POLL_INTERVAL_MS = 1_000;

function isTerminal(status: TaskRunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

function projectResult(run: TaskRun, timedOut: boolean): McpTaskRunResult {
  return {
    taskId: run.taskId,
    runId: run.id,
    status: run.status,
    outcome: run.outcome ?? null,
    finalMessage: run.finalMessage ?? null,
    resultText: run.resultText ?? null,
    needsHumanReview: run.needsHumanReview,
    startedAt: run.startedAt ?? null,
    completedAt: run.completedAt ?? null,
    // Titles/types only — no link/storage key/path (real URLs land in Phase 6).
    artifacts: run.artifacts.map((artifact) => ({
      title: artifact.title,
      description: artifact.description,
      type: artifact.type,
    })),
    timedOut,
  };
}

export type PublicMcpRunService = ReturnType<typeof createPublicMcpRunService>;

export function createPublicMcpRunService(deps: {
  taskService: TaskService;
  // Resolves the configured sync-wait cap (ms). Falls back to the default when
  // absent. Phase 4 wires this to the public MCP settings (cached).
  resolveCapMs?: () => Promise<number>;
}) {
  return {
    /** Current run result projection (no waiting). Undefined if the run is unknown. */
    async getResult(runId: string): Promise<McpTaskRunResult | undefined> {
      const run = await deps.taskService.getRunById(runId);
      return run ? projectResult(run, !isTerminal(run.status)) : undefined;
    },

    /**
     * Poll the run until it reaches a terminal state or the wait cap elapses.
     * On timeout the projection carries `timedOut: true` (the run keeps executing;
     * the client should poll get_task_result). Undefined if the run is unknown.
     */
    async waitForResult(
      runId: string,
      options?: {
        capMs?: number;
        pollMs?: number;
        sleep?: (ms: number) => Promise<void>;
      },
    ): Promise<McpTaskRunResult | undefined> {
      const capMs = options?.capMs ?? (await deps.resolveCapMs?.()) ?? DEFAULT_SYNC_WAIT_CAP_MS;
      const pollMs = options?.pollMs ?? DEFAULT_POLL_INTERVAL_MS;
      const sleep =
        options?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
      const deadline = Date.now() + capMs;

      let run = await deps.taskService.getRunById(runId);
      if (!run) {
        return undefined;
      }

      while (!isTerminal(run.status) && Date.now() < deadline) {
        await sleep(pollMs);
        run = await deps.taskService.getRunById(runId);
        if (!run) {
          return undefined;
        }
      }

      return projectResult(run, !isTerminal(run.status));
    },
  };
}
