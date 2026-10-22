import {
  specialistCapabilitySelectionSchema,
  taskPermissionProfileSchema,
} from "@cc/shared/schemas";
import type { AppDb } from "../db/client.js";
import type { EmbeddedToolCaller } from "./embedded-tool-caller.js";

export async function readEmbeddedToolProfile(db: AppDb, caller: EmbeddedToolCaller) {
  if (caller.context === "task_run") {
    const run = await db.query.task_runs.findFirst({
      where: (table, { eq }) => eq(table.id, caller.taskRunId),
    });
    if (!run?.effective_permissions_json)
      throw new Error("Task permissions have not been snapshotted.");
    return taskPermissionProfileSchema.parse(JSON.parse(run.effective_permissions_json));
  }
  const agent = await db.query.agents.findFirst({
    where: (table, { eq }) => eq(table.id, caller.agentId),
  });
  if (!agent || agent.status !== "active") throw new Error("Tool specialist is not active.");
  return specialistCapabilitySelectionSchema.parse(JSON.parse(agent.capabilities_json));
}
