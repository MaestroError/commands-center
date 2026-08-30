// Run reply + reactivation flow, split out of task-execution-service.ts
// (issue #99). The core loop injects its dependencies via ctx.

import type { AcceptedPromptEvidence, TaskExecutionServiceOptions } from "./context.js";
import type { ConversationDetail, TaskContext, TaskRun, TaskRunFollowup } from "@cc/shared/schemas";
import { and, eq, isNull } from "drizzle-orm";
import { task_runs, tasks } from "../../db/schema/index.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/api-error.js";
import type { ConversationService, TaskRunPromptStart } from "../conversation-service.js";
import type { TaskRunMonitorConfig } from "../task-run-monitor-service.js";
import { buildTaskRunErrorDetails, mergeOpencodeMonitorMetadata } from "../task-run-support.js";

export interface TaskReplyFlowContext {
  options: TaskExecutionServiceOptions;
  findRun: (runId: string) => Promise<TaskRun>;
  startTaskRunPromptWithRetry: (
    run: TaskRun,
    conversation: ConversationDetail,
    input: {
      text: string;
      attachments: Parameters<ConversationService["startTaskRunPrompt"]>[1]["attachments"];
      model?: string;
    },
  ) => Promise<
    | { type: "started"; promptStart: TaskRunPromptStart }
    | { type: "accepted"; evidence: AcceptedPromptEvidence }
  >;
  resumeAcceptedPromptRun: (run: TaskRun, evidence: AcceptedPromptEvidence) => Promise<TaskRun>;
  handleTerminalRun: (run: TaskRun, input: { triggerContext?: TaskContext }) => Promise<void>;
  readRunContext: (run: TaskRun) => TaskContext | undefined;
  monitorConfig: TaskRunMonitorConfig;
  monitorService: { start: (runId: string) => void };
}

export function createTaskReplyFlow(ctx: TaskReplyFlowContext) {
  const {
    options,
    findRun,
    startTaskRunPromptWithRetry,
    resumeAcceptedPromptRun,
    handleTerminalRun,
    readRunContext,
    monitorConfig,
    monitorService,
  } = ctx;

  async function sendRunReply(runId: string, input: unknown): Promise<TaskRunFollowup> {
    if (!options.db) {
      throw new Error("Database client is required to send a run reply.");
    }

    if (!options.conversationService) {
      throw new Error("Conversation service is required to send a run reply.");
    }

    const run = await findRun(runId);

    if (run.status === "running") {
      throw new ConflictError("Cannot send a reply while the run is in progress.");
    }

    if (!run.opencodeSessionId) {
      throw new ConflictError("Task run does not have an OpenCode session.");
    }

    if (run.status !== "completed" && run.status !== "failed" && run.status !== "error") {
      throw new BadRequestError("Only completed, failed, or error task runs can receive a reply.");
    }

    const inspection = await options.conversationService.inspectTaskRunConversation(
      run.taskId,
      run.id,
    );
    const conversation = inspection.conversation;

    if (!conversation) {
      throw new NotFoundError("Task run session not found.");
    }

    const resumed = await reactivateRunForReply(run);
    const followup = await options.taskService.insertFollowup(resumed, input);

    // Once the prompt has reached OpenCode the reply is in flight; a failure in
    // the post-delivery bookkeeping below must NOT pre-mark the reply as failed,
    // or finalizeInFlightRunFollowup (the single terminal authority) could no
    // longer attach the eventual answer. Only a genuine delivery failure marks
    // the reply failed here.
    let delivered = false;

    try {
      const promptStart = await startTaskRunPromptWithRetry(resumed, conversation, {
        text: followup.body,
        attachments: [],
        model: resumed.model,
      });
      delivered = true;

      let accepted: TaskRun;
      if (promptStart.type === "accepted") {
        accepted = await resumeAcceptedPromptRun(resumed, promptStart.evidence);
      } else {
        const updated = await options.taskService.updateRun(resumed.id, {
          triggerMetadata: mergeOpencodeMonitorMetadata(resumed.triggerMetadata, {
            conversationId: promptStart.promptStart.conversationId,
            opencodeSessionId: promptStart.promptStart.opencodeSessionId,
            attemptedModel: promptStart.promptStart.attemptedModel,
            baselineMessageCount: promptStart.promptStart.baselineMessageCount,
            promptAcceptedAt: promptStart.promptStart.promptAcceptedAt,
          }),
        });

        if (!updated) {
          throw new NotFoundError("Task run not found.");
        }

        accepted = updated;
        if (monitorConfig.autoStart) {
          monitorService.start(accepted.id);
        }
      }

      // The followup row is left in "sending" — it's finalized (answered/failed)
      // once the run reaches terminal status again, via
      // finalizeInFlightRunFollowup (called from notifyRunTerminal).
      return followup;
    } catch (error) {
      // Pre-delivery (transport) failure: the reply never reached OpenCode, so
      // mark it failed directly. Post-delivery failures leave it "sending" and
      // let the run's terminal transition finalize it.
      const failed = delivered
        ? undefined
        : await options.taskService.markFollowupFailed(
            followup.id,
            error instanceof Error ? error.message : "Failed to deliver reply.",
          );

      const latest = await findRun(resumed.id);

      if (latest.status !== "running") {
        await handleTerminalRun(latest, { triggerContext: readRunContext(latest) });
        return failed ?? followup;
      }

      const errored = await options.taskService.setRunStatus(resumed.id, "error", {
        completedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : "Task execution failed.",
        errorDetails: buildTaskRunErrorDetails(error, resumed),
      });

      if (!errored) {
        throw new NotFoundError("Task run not found.");
      }

      await handleTerminalRun(errored, { triggerContext: readRunContext(resumed) });
      return failed ?? followup;
    }
  }

  async function reactivateRunForReply(run: TaskRun): Promise<TaskRun> {
    if (!options.db) {
      throw new Error("Database client is required to send a run reply.");
    }

    const running = await options.taskService.getRunningRunForAgent(run.agentId);

    if (running && running.id !== run.id) {
      throw new ConflictError("Agent already has a running task run.", { runId: running.id });
    }

    const timestamp = new Date();
    try {
      options.db
        .update(task_runs)
        .set({
          status: "running",
          outcome: null,
          needs_human_review: false,
          human_review_reason: null,
          review_question_json: null,
          error_message: null,
          error_details_json: null,
          completed_at: null,
          cancelled_at: null,
          cancellation_reason: null,
          started_at: timestamp,
          updated_at: timestamp,
        })
        .where(eq(task_runs.id, run.id))
        .run();
    } catch (error) {
      if (isRunningAgentConstraintError(error)) {
        const running = await options.taskService.getRunningRunForAgent(run.agentId);
        throw new ConflictError(
          "Agent already has a running task run.",
          running ? { runId: running.id } : undefined,
        );
      }

      throw error;
    }

    options.db
      .update(tasks)
      .set({
        status: "queued",
        updated_at: timestamp,
      })
      .where(and(eq(tasks.id, run.taskId), isNull(tasks.deleted_at)))
      .run();

    const resumed = await options.taskService.getRunById(run.id);

    if (!resumed) {
      throw new NotFoundError("Task run not found.");
    }

    return resumed;
  }

  function isRunningAgentConstraintError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes("task_runs_agent_running_unique_idx") ||
        error.message.includes("UNIQUE constraint failed: task_runs.agent_id"))
    );
  }

  return { sendRunReply };
}
