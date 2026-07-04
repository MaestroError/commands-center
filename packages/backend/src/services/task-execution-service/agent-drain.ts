// Per-agent queue drain + unhealthy-engine deferral, split out of
// task-execution-service.ts (issue #99). Injected into the run loop via ctx.

import type { AgentDrainDeferral, TaskRunDeferConfig } from "../task-execution-service.js";
import type { TaskExecutionServiceOptions } from "./context.js";
import type { TaskRun } from "@cc/shared/schemas";
import type { OpenCodeOrchestrator } from "../../orchestrator/opencode-orchestrator.js";

export interface TaskAgentDrainContext {
  options: TaskExecutionServiceOptions;
  agentDrainDeferrals: Map<string, AgentDrainDeferral>;
  deferConfig: TaskRunDeferConfig;
  runQueuedTask: (runId: string) => Promise<TaskRun>;
}

export function createAgentDrainQueue(ctx: TaskAgentDrainContext) {
  const { options, agentDrainDeferrals, deferConfig, runQueuedTask } = ctx;

  function scheduleAgentDrain(agentId: string): void {
    void drainAgentQueue(agentId).catch((error: unknown) => {
      options.logger?.error({ err: error, agentId }, "task queue drain failed");
    });
  }

  async function drainAgentQueue(agentId: string): Promise<void> {
    const running = await options.taskService.getRunningRunForAgent(agentId);

    if (running) {
      return;
    }

    const nextRun = await options.taskService.getNextQueuedRunForAgent(agentId);

    if (!nextRun) {
      resetAgentDrainDeferral(agentId);
      return;
    }

    if (deferQueuedRunIfOpenCodeIsUnhealthy(nextRun)) {
      return;
    }

    resetAgentDrainDeferral(agentId);
    const started = await runQueuedTask(nextRun.id);

    if (started.status === "queued") {
      return;
    }
  }

  function deferQueuedRunIfOpenCodeIsUnhealthy(run: TaskRun): boolean {
    if (!options.conversationService || !options.orchestrator) {
      return false;
    }

    const status = options.orchestrator.getStatus();

    if (status.healthy) {
      resetAgentDrainDeferral(run.agentId);
      return false;
    }

    scheduleDeferredAgentDrain(run, status);
    return true;
  }

  function scheduleDeferredAgentDrain(
    run: TaskRun,
    status: ReturnType<OpenCodeOrchestrator["getStatus"]>,
  ): void {
    const existing = agentDrainDeferrals.get(run.agentId);

    if (existing?.timer) {
      return;
    }

    const delayMs = computeDeferDelay(existing?.delayMs ?? deferConfig.initialDelayMs);
    const nextDelayMs = Math.min(deferConfig.maxDelayMs, delayMs * 2);
    const deferral: AgentDrainDeferral = { delayMs: nextDelayMs };

    options.logger?.warn(
      {
        taskId: run.taskId,
        taskRunId: run.id,
        agentId: run.agentId,
        engineState: status.state,
        lastError: status.lastError,
        nextDelayMs: delayMs,
      },
      "deferred queued task run because OpenCode is unhealthy",
    );

    deferral.timer = setTimeout(() => {
      deferral.timer = undefined;
      void drainAgentQueue(run.agentId).catch((error: unknown) => {
        options.logger?.error({ err: error, agentId: run.agentId }, "task queue drain failed");
      });
    }, delayMs);
    deferral.timer.unref?.();
    agentDrainDeferrals.set(run.agentId, deferral);
  }

  function resetAgentDrainDeferral(agentId: string): void {
    const deferral = agentDrainDeferrals.get(agentId);

    if (!deferral) {
      return;
    }

    if (deferral.timer) {
      clearTimeout(deferral.timer);
    }

    agentDrainDeferrals.delete(agentId);
  }

  function computeDeferDelay(baseDelayMs: number): number {
    const cappedDelayMs = Math.min(deferConfig.maxDelayMs, Math.max(0, baseDelayMs));
    const jitterMs =
      deferConfig.jitterRatio > 0 ? cappedDelayMs * deferConfig.jitterRatio * Math.random() : 0;

    return Math.max(0, Math.round(cappedDelayMs + jitterMs));
  }

  return { scheduleAgentDrain, deferQueuedRunIfOpenCodeIsUnhealthy };
}
