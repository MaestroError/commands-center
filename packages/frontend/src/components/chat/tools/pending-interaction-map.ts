import type { ConversationMessage, ConversationPart, LiveRequest } from "@cc/shared/schemas";

import type { PermissionRequest, QuestionRequest } from "@/hooks/use-conversation";
import type { PendingToolInteraction } from "./pending-interaction-context";

type BuildPendingInteractionMapInput = {
  permissions: PermissionRequest[];
  question: QuestionRequest | null;
  liveRequests: LiveRequest[];
  messages: ConversationMessage[];
  parts: Record<string, ConversationPart[]>;
};

/**
 * Maps a tool call id to the interaction currently blocking it, so a tool row's
 * status dot can offer a cancel affordance.
 *
 * Permissions and questions carry OpenCode's `tool.callID`, so they map
 * directly. Live requests do not — the MCP tool that raises one never sees
 * OpenCode's call id — so they're correlated to the still-running tool rows by
 * chronological order: the most recent running tool calls line up with the open
 * live requests in creation order. This is exact in the common single-request
 * case and preserves order for multiple concurrent requests.
 */
export function buildPendingInteractionMap(
  input: BuildPendingInteractionMapInput,
): Map<string, PendingToolInteraction> {
  const map = new Map<string, PendingToolInteraction>();

  for (const permission of input.permissions) {
    if (permission.tool?.callID) {
      map.set(permission.tool.callID, { kind: "permission", requestId: permission.id });
    }
  }

  if (input.question?.tool?.callID) {
    map.set(input.question.tool.callID, { kind: "question", requestId: input.question.id });
  }

  // `show_file_to_user` requests auto-resolve and have no cancel form, so they
  // never need a cancel affordance.
  const cancellableRequests = input.liveRequests
    .filter((request) => request.kind !== "show_file_to_user")
    .slice()
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  if (cancellableRequests.length > 0) {
    const runningCallIds = collectRunningToolCallIds(input.messages, input.parts).filter(
      (callId) => !map.has(callId),
    );
    // The blocked tool calls are the most recent running ones, and they map to
    // the most recent live requests. Align both lists FROM THE END: the last
    // running call ↔ the last (newest) request. Aligning from the start would
    // mis-map a pending tool to a stale/earlier request when the counts differ
    // (e.g. a completed tool's request lingering) — cancelling the wrong one.
    const tail = runningCallIds.slice(
      Math.max(0, runningCallIds.length - cancellableRequests.length),
    );
    const requestOffset = cancellableRequests.length - tail.length;

    tail.forEach((callId, index) => {
      const request = cancellableRequests[requestOffset + index];
      if (request) {
        map.set(callId, { kind: "live-request", requestId: request.id });
      }
    });
  }

  return map;
}

/** Call ids of tool parts still running/pending, in timeline (message then part) order. */
export function collectRunningToolCallIds(
  messages: ConversationMessage[],
  parts: Record<string, ConversationPart[]>,
): string[] {
  const callIds: string[] = [];

  for (const message of messages) {
    const messageParts = parts[message.id] ?? message.parts;

    for (const part of messageParts) {
      if (part.type !== "tool") {
        continue;
      }

      const state = part["state"] as { status?: string } | undefined;
      if (state?.status === "pending" || state?.status === "running") {
        const callId = part["callID"];
        if (typeof callId === "string") {
          callIds.push(callId);
        }
      }
    }
  }

  return callIds;
}
