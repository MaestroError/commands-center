import { realpath } from "node:fs/promises";
import { join } from "node:path";

import type { AppDb } from "../db/client.js";

export type EmbeddedToolCaller = {
  agentId: string;
  agentSlug: string;
  sessionID: string;
  ownerSessionID: string;
} & (
  | { context: "chat"; conversationId: string }
  | { context: "task_run"; taskId: string; taskRunId: string }
);

type SessionOwner = {
  parentID?: string;
  location: { directory: string };
};

export function createEmbeddedToolCallerResolver(options: {
  db: AppDb;
  specialistsDirectory: string;
  getSession(sessionID: string): Promise<SessionOwner>;
}): (directory: string, sessionID: string) => Promise<EmbeddedToolCaller> {
  return async (directory, sessionID) => {
    const expectedDirectory = await realpath(directory);
    const visited = new Set<string>();
    let current: string | undefined = sessionID;
    while (current !== undefined) {
      if (visited.has(current)) throw callerRejected("Cyclic tool caller session ancestry.");
      visited.add(current);
      const session = await options.getSession(current);
      if ((await realpath(session.location.directory)) !== expectedDirectory) {
        throw callerRejected("Tool caller session belongs to another workspace.");
      }
      const [conversation, runs] = await Promise.all([
        options.db.query.conversations.findFirst({
          where: (table, { eq }) => eq(table.opencode_session_id, current!),
        }),
        options.db.query.task_runs.findMany({
          where: (table, { eq }) => eq(table.opencode_session_id, current!),
        }),
      ]);
      if (runs.length > 1) throw callerRejected("Ambiguous tool caller task session.");
      const run = runs[0];
      if (run || conversation) {
        if (
          (run &&
            conversation &&
            (conversation.task_run_id !== run.id ||
              conversation.task_id !== run.task_id ||
              conversation.agent_id !== run.agent_id)) ||
          (!run && conversation?.source !== "chat")
        ) {
          throw callerRejected("Conflicting tool caller ownership.");
        }
        const agentId = run?.agent_id ?? conversation!.agent_id;
        const agent = await options.db.query.agents.findFirst({
          where: (table, { eq }) => eq(table.id, agentId),
        });
        if (!agent || agent.status !== "active") {
          throw callerRejected("Tool caller specialist is not active.");
        }
        if (
          (await realpath(join(options.specialistsDirectory, agent.slug))) !== expectedDirectory
        ) {
          throw callerRejected("Tool caller belongs to another specialist.");
        }
        const identity = {
          agentId,
          agentSlug: agent.slug,
          sessionID,
          ownerSessionID: current,
        };
        if (run) {
          if (run.status !== "running")
            throw callerRejected("Tool caller task run is not running.");
          return {
            ...identity,
            context: "task_run",
            taskId: run.task_id,
            taskRunId: run.id,
          };
        }
        return { ...identity, context: "chat", conversationId: conversation!.id };
      }
      current = session.parentID;
    }
    throw callerRejected("Tool caller session has no CC owner.");
  };
}

function callerRejected(message: string): Error {
  return Object.assign(new Error(message), { name: "CcToolCallerRejected" });
}
