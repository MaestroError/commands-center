// Per-agent queue drain + unhealthy-engine deferral, split out of
// task-execution-service.ts (issue #99). Injected into the run loop via ctx.

import type { AgentDrainDeferral, TaskRunDeferConfig } from "../task-execution-service.js";
import type { TaskExecutionServiceOptions } from "./context.js";
import type { TaskRun } from "@cc/shared/schemas";

export interface TaskAgentDrainContext {
  options: TaskExecutionServiceOptions;
  agentDrainDeferrals: Map<string, AgentDrainDeferral>;
  deferConfig: TaskRunDeferConfig;
  dispatchNextReply: (agentId: string, before?: string) => Promise<boolean>;
  runQueuedTask: (runId: string) => Promise<TaskRun>;
}

export function createAgentDrainQueue(ctx: TaskAgentDrainContext) {
  const { options, agentDrainDeferrals, deferConfig, runQueuedTask, dispatchNextReply } = ctx;
  const draining = new Set<string>();
  const requested = new Set<string>();
  let active = true;

  function scheduleAgentDrain(agentId: string): void {
    if (!active) return;
    requested.add(agentId);
    if (draining.has(agentId)) return;
    draining.add(agentId);
    void (async () => {
      try {
        while (active && requested.delete(agentId)) await drainAgentQueue(agentId);
      } catch (error) {
        options.logger?.error({ err: error, agentId }, "task queue drain failed");
      } finally {
        draining.delete(agentId);
      }
    })();
  }

  async function drainAgentQueue(agentId: string): Promise<void> {
    const running = await options.taskService.getRunningRunForAgent(agentId);

    if (!active || running) {
      return;
    }

    const nextRun = await options.taskService.getNextQueuedRunForAgent(agentId);

    if (options.orchestrator && !options.orchestrator.getStatus().healthy) {
      if (nextRun) deferQueuedRunIfOpenCodeIsUnhealthy(nextRun);
      else if (!agentDrainDeferrals.get(agentId)?.timer) {
        const timer = setTimeout(() => {
          agentDrainDeferrals.delete(agentId);
          scheduleAgentDrain(agentId);
        }, deferConfig.initialDelayMs);
        timer.unref?.();
        agentDrainDeferrals.set(agentId, { timer, delayMs: deferConfig.initialDelayMs });
      }
      return;
    }
    if (await dispatchNextReply(agentId, nextRun?.createdAt)) {
      requested.add(agentId);
      return;
    }

    if (!nextRun) {
      resetAgentDrainDeferral(agentId);
      return;
    }

    if (deferQueuedRunIfOpenCodeIsUnhealthy(nextRun)) {
      return;
    }

    resetAgentDrainDeferral(agentId);
    void runQueuedTask(nextRun.id).catch((error: unknown) => {
      options.logger?.error({ err: error, runId: nextRun.id }, "queued task execution failed");
    });
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
    status: ReturnType<NonNullable<TaskExecutionServiceOptions["orchestrator"]>["getStatus"]>,
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
      scheduleAgentDrain(run.agentId);
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

  return {
    scheduleAgentDrain,
    deferQueuedRunIfOpenCodeIsUnhealthy,
    stop: () => {
      active = false;
      requested.clear();
    },
    resume: () => {
      active = true;
    },
  };
}
