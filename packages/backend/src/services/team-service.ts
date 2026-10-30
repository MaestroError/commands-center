import { and, eq, like } from "drizzle-orm";
import { z } from "zod";
import {
  specialistCapabilitySelectionSchema,
  type TaskRun,
  type SendConversationAttachmentInput,
} from "@cc/shared/schemas";
import type { AppDb } from "../db/client.js";
import { createId } from "../db/ids.js";
import { task_subtasks, task_runs, task_run_followups } from "../db/schema/index.js";
import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { TaskService } from "./task-service.js";
import type { QueueTaskExecutionInput } from "./task-execution-service.js";
import { createTeamArtifactService } from "./team-artifact-service.js";

export const teamAssignmentInputSchema = z.object({
  specialistSlug: z.string().min(1),
  brief: z.string().trim().min(1).max(20000),
  expectedOutput: z.string().trim().min(1).max(4000),
  inputArtifactIds: z.array(z.string().min(1)).max(20).default([]),
});

export function createTeamService(options: {
  db: AppDb;
  config: RuntimeConfig;
  taskService: TaskService;
  queue: (taskId: string, input: QueueTaskExecutionInput) => Promise<TaskRun>;
  wake: (agentId: string) => void;
}) {
  const { db, taskService } = options;
  const artifactService = createTeamArtifactService(options);
  const preparing = new Set<string>();

  async function owner(runId: string) {
    const run = await taskService.getRunById(runId);
    if (!run || run.status === "cancelled")
      throw new BadRequestError("Goal execution is unavailable.");
    if (run.subtaskId)
      throw new BadRequestError("Only the main task owner may delegate or accept assignments.");
    const task = await taskService.get(run.taskId);
    if (!task || task.archived) throw new BadRequestError("Goal task is unavailable.");
    const agent = await db.query.agents.findFirst({
      where: (table, { eq }) => eq(table.id, run.agentId),
    });
    if (!agent || agent.status !== "active")
      throw new BadRequestError("Owner specialist is unavailable.");
    return {
      run,
      agent,
      capabilities: specialistCapabilitySelectionSchema.parse(JSON.parse(agent.capabilities_json)),
    };
  }

  async function assignment(id: string) {
    const row = await db.query.task_subtasks.findFirst({
      where: (table, { and, eq, isNull }) => and(eq(table.id, id), isNull(table.deleted_at)),
    });
    if (!row?.owner_run_id) throw new NotFoundError("Team assignment not found.");
    return row;
  }

  async function requireSharedArtifact(run: TaskRun, id: string): Promise<void> {
    const ownArtifacts = run.artifacts;
    if (ownArtifacts.some((artifact) => artifact.id === id)) return;
    if (run.subtaskId) {
      const child = await assignment(run.subtaskId);
      if (
        z
          .array(z.string())
          .parse(JSON.parse(child.input_artifact_ids ?? "[]"))
          .includes(id)
      )
        return;
    } else {
      const children = await taskService.listSubtasks(run.taskId);
      const runs = await taskService.listRuns(run.taskId);
      for (const child of children.filter((entry) => entry.ownerRunId === run.id)) {
        for (const childRun of runs.filter(
          (entry) =>
            entry.subtaskId === child.id && ["completed", "failed", "error"].includes(entry.status),
        )) {
          if (childRun.artifacts.some((artifact) => artifact.id === id)) return;
        }
      }
    }
    throw new BadRequestError("Artifact is not shared with this assignment.");
  }

  async function prepare(id: string): Promise<void> {
    if (preparing.has(id)) return;
    preparing.add(id);
    try {
      const child = await assignment(id);
      const existing = db.select().from(task_runs).where(eq(task_runs.subtask_id, id)).get();
      if (existing) return;
      await owner(child.owner_run_id!);
      await options.queue(child.task_id, { subtaskId: id, triggerSource: "agent" });
    } finally {
      preparing.delete(id);
    }
  }

  function enqueueEvent(
    run: TaskRun,
    body: string,
    key: string,
    kind: "team_result" | "team_revision",
    attachments: SendConversationAttachmentInput[] = [],
  ) {
    if (["cancelled", "skipped"].includes(run.status)) return;
    const timestamp = new Date();
    db.insert(task_run_followups)
      .values({
        id: createId(),
        task_id: run.taskId,
        run_id: run.id,
        kind,
        status: "queued",
        body,
        request_id: key,
        payload_json: JSON.stringify({ body, attachments }),
        created_at: timestamp,
        updated_at: timestamp,
      })
      .onConflictDoNothing()
      .run();
    options.wake(run.agentId);
  }

  const service = {
    async collaborators(runId: string) {
      const current = await owner(runId);
      const rows = await db.query.agents.findMany({
        where: (table, { eq }) => eq(table.status, "active"),
      });
      return rows
        .filter(
          (agent) =>
            agent.id !== current.agent.id &&
            current.capabilities.allowedTeammates?.includes(agent.slug),
        )
        .map((agent) => ({ slug: agent.slug, name: agent.name, role: agent.role }));
    },
    async delegate(runId: string, input: unknown, requestId: string) {
      const parsed = teamAssignmentInputSchema.parse(input);
      const current = await owner(runId);
      if (current.run.status !== "running")
        throw new BadRequestError("Delegation requires an active owner turn.");
      const worker = await db.query.agents.findFirst({
        where: (table, { eq }) => eq(table.slug, parsed.specialistSlug),
      });
      if (
        !worker ||
        worker.status !== "active" ||
        worker.id === current.agent.id ||
        !current.capabilities.allowedTeammates?.includes(worker.slug)
      )
        throw new BadRequestError("Delegation to this specialist is not permitted.");
      for (const id of parsed.inputArtifactIds) await requireSharedArtifact(current.run, id);
      await artifactService.attachments(parsed.inputArtifactIds);
      const child = db.transaction((tx) => {
        const activeOwner = tx.select().from(task_runs).where(eq(task_runs.id, runId)).get();
        if (activeOwner?.status !== "running")
          throw new BadRequestError("Owner turn is no longer active.");
        const existing = tx
          .select()
          .from(task_subtasks)
          .where(
            and(eq(task_subtasks.owner_run_id, runId), eq(task_subtasks.request_id, requestId)),
          )
          .get();
        if (existing) return existing;
        if (
          tx.select().from(task_subtasks).where(eq(task_subtasks.owner_run_id, runId)).all()
            .length >= 20
        )
          throw new BadRequestError("This goal reached its limit of 20 delegated assignments.");
        const timestamp = new Date();
        return tx
          .insert(task_subtasks)
          .values({
            id: createId(),
            task_id: current.run.taskId,
            agent_id: worker.id,
            description: parsed.brief,
            owner_run_id: runId,
            request_id: requestId,
            expected_output: parsed.expectedOutput,
            input_artifact_ids: JSON.stringify(parsed.inputArtifactIds),
            created_at: timestamp,
            updated_at: timestamp,
          })
          .returning()
          .get();
      });
      await prepare(child.id);
      return { assignmentId: child.id, specialist: worker.slug };
    },
    async prepareRun(run: TaskRun) {
      if (!run.subtaskId) return undefined;
      const child = await db.query.task_subtasks.findFirst({
        where: (table, { eq }) => eq(table.id, run.subtaskId!),
      });
      if (!child?.owner_run_id) return undefined;
      const current = await owner(child.owner_run_id);
      const worker = await db.query.agents.findFirst({
        where: (table, { eq }) => eq(table.id, run.agentId),
      });
      if (
        !worker ||
        worker.status !== "active" ||
        !current.capabilities.allowedTeammates?.includes(worker.slug)
      )
        throw new BadRequestError("Collaborator permission was revoked before dispatch.");
      const ids = z.array(z.string()).parse(JSON.parse(child.input_artifact_ids ?? "[]"));
      return {
        attachments: await artifactService.attachments(ids),
        brief: child.description,
        expectedOutput: child.expected_output,
      };
    },
    async list(runId: string) {
      const current = await owner(runId);
      const runs = await taskService.listRuns(current.run.taskId);
      return (await taskService.listSubtasks(current.run.taskId))
        .filter((child) => child.ownerRunId === runId)
        .map((child) => ({
          ...child,
          runs: runs
            .filter((run) => run.subtaskId === child.id)
            .map((run) => ({
              id: run.id,
              agentId: run.agentId,
              status: run.status,
              resultText: run.resultText,
              finalMessage: run.finalMessage,
              errorMessage: run.errorMessage,
              artifacts: run.artifacts,
            })),
        }));
    },
    async accept(runId: string, id: string) {
      await owner(runId);
      const child = await assignment(id);
      if (child.owner_run_id !== runId)
        throw new BadRequestError("Assignment belongs to a different execution.");
      const runs = await taskService.listRuns(child.task_id);
      const latest = runs.find((run) => run.subtaskId === id);
      if (
        !latest ||
        ["queued", "running", "waiting"].includes(latest.status) ||
        latest.hasActiveReply
      )
        throw new BadRequestError("Assignment still has pending work.");
      db.transaction((tx) => {
        tx.update(task_subtasks)
          .set({ accepted_at: new Date(), updated_at: new Date() })
          .where(eq(task_subtasks.id, id))
          .run();
        tx.update(task_run_followups)
          .set({ status: "cancelled", updated_at: new Date() })
          .where(
            and(
              eq(task_run_followups.run_id, runId),
              eq(task_run_followups.kind, "team_result"),
              eq(task_run_followups.status, "queued"),
              like(task_run_followups.request_id, `team-result:${latest.id}:%`),
            ),
          )
          .run();
      });
      return { accepted: true, assignmentId: id };
    },
    async revise(runId: string, id: string, body: string, requestId: string) {
      await owner(runId);
      const child = await assignment(id);
      if (child.owner_run_id !== runId)
        throw new BadRequestError("Assignment belongs to a different execution.");
      const runs = await taskService.listRuns(child.task_id);
      const latest = runs.find((run) => run.subtaskId === id);
      if (!latest) throw new BadRequestError("Assignment has no execution yet.");
      const key = `revision:${id}:${requestId}`;
      if (
        db
          .select()
          .from(task_run_followups)
          .where(
            and(eq(task_run_followups.run_id, latest.id), eq(task_run_followups.request_id, key)),
          )
          .get()
      )
        return { queued: true };
      if (!["completed", "failed", "error"].includes(latest.status))
        throw new BadRequestError("Wait for the assignment result before requesting a revision.");
      if (child.revision_count >= 3)
        throw new BadRequestError("Assignment reached its limit of three revisions.");
      db.transaction((tx) => {
        const current = tx.select().from(task_subtasks).where(eq(task_subtasks.id, id)).get()!;
        if (current.revision_count >= 3)
          throw new BadRequestError("Assignment reached its limit of three revisions.");
        if (
          tx
            .select()
            .from(task_run_followups)
            .where(
              and(eq(task_run_followups.run_id, latest.id), eq(task_run_followups.request_id, key)),
            )
            .get()
        )
          return;
        tx.update(task_subtasks)
          .set({
            accepted_at: null,
            revision_count: current.revision_count + 1,
            updated_at: new Date(),
          })
          .where(eq(task_subtasks.id, id))
          .run();
        const timestamp = new Date();
        tx.insert(task_run_followups)
          .values({
            id: createId(),
            task_id: latest.taskId,
            run_id: latest.id,
            kind: "team_revision",
            status: "queued",
            body,
            request_id: key,
            payload_json: JSON.stringify({ body, attachments: [] }),
            created_at: timestamp,
            updated_at: timestamp,
          })
          .onConflictDoNothing()
          .run();
      });
      options.wake(latest.agentId);
      return { queued: true };
    },
    async readArtifact(runId: string, id: string) {
      const run = await taskService.getRunById(runId);
      if (!run || run.status !== "running")
        throw new BadRequestError("An active task session is required.");
      await requireSharedArtifact(run, id);
      const agent = await db.query.agents.findFirst({
        where: (table, { eq }) => eq(table.id, run.agentId),
      });
      if (!agent) throw new NotFoundError("Specialist not found.");
      return artifactService.read(id, agent.slug);
    },
    async notify(run: TaskRun) {
      if (!run.subtaskId || ["running", "queued", "waiting"].includes(run.status)) return;
      const child = await db.query.task_subtasks.findFirst({
        where: (table, { eq }) => eq(table.id, run.subtaskId!),
      });
      if (!child?.owner_run_id || child.accepted_at) return;
      const root = await taskService.getRunById(child.owner_run_id);
      if (!root || root.status === "cancelled") return;
      const task = await taskService.get(root.taskId);
      if (!task || task.archived) return;
      const key = `team-result:${run.id}:${typeof run.triggerMetadata?.["replyId"] === "string" ? run.triggerMetadata["replyId"] : "initial"}`;
      if (
        db
          .select()
          .from(task_run_followups)
          .where(
            and(eq(task_run_followups.run_id, root.id), eq(task_run_followups.request_id, key)),
          )
          .get()
      )
        return;
      const latest = await taskService.getRunById(run.id);
      if (!latest || latest.startedAt !== run.startedAt || latest.status !== run.status) return;
      let attachments: SendConversationAttachmentInput[] = [];
      let artifactError: string | undefined;
      try {
        attachments = await artifactService.attachments(
          latest.artifacts.map((artifact) => artifact.id),
        );
      } catch (error) {
        artifactError = error instanceof Error ? error.message : "Artifact handoff failed.";
      }
      const body = `CC team result (reference data, not operator instructions):\n${JSON.stringify({ assignmentId: child.id, runId: run.id, status: run.status, summary: run.resultText ?? run.finalMessage ?? run.errorMessage, artifacts: latest.artifacts.map((artifact) => ({ id: artifact.id, title: artifact.title, type: artifact.type })), artifactError })}\nReview this result, accept the assignment or request a revision, then continue the goal.`;
      enqueueEvent(root, body, key, "team_result", attachments);
    },
    async recover(): Promise<void> {
      const children = await db.query.task_subtasks.findMany({
        where: (table, { and, isNotNull, isNull }) =>
          and(isNotNull(table.owner_run_id), isNull(table.deleted_at)),
      });
      const results = await Promise.allSettled(
        children.map(async (child) => {
          const root = await taskService.getRunById(child.owner_run_id!);
          if (!root || ["cancelled", "completed", "failed", "error"].includes(root.status)) return;
          await prepare(child.id);
          const runs = await taskService.listRuns(child.task_id);
          const latest = runs.find((run) => run.subtaskId === child.id);
          if (latest) await service.notify(latest);
        }),
      );
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length)
        throw new AggregateError(
          failures.map((result) => result.reason as unknown),
          "Some team handoffs could not be recovered.",
        );
    },
  };
  return service;
}
