import type { ConversationPart } from "@cc/shared/schemas";
import { CONTEXT_GROUP_TOOLS, HIDDEN_TOOLS, getToolName } from "./tool-registry";

export type GroupedEntry =
  | { type: "context"; parts: ConversationPart[] }
  | { type: "single"; part: ConversationPart };

/**
 * Groups consecutive context tool calls (read, glob, grep, list) into
 * collapsible summary rows. Non-context tools and non-tool parts break
 * the group and render individually.
 */
export function groupParts(parts: ConversationPart[]): GroupedEntry[] {
  const result: GroupedEntry[] = [];
  let contextBuffer: ConversationPart[] = [];

  function flushContext() {
    if (contextBuffer.length > 0) {
      result.push({ type: "context", parts: contextBuffer });
      contextBuffer = [];
    }
  }

  for (const part of parts) {
    if (part.type === "tool") {
      const name = getToolName(part);

      if (HIDDEN_TOOLS.has(name)) {
        continue;
      }

      if (CONTEXT_GROUP_TOOLS.has(name)) {
        contextBuffer.push(part);
        continue;
      }

      // Non-context tool — flush any pending context group first
      flushContext();
      result.push({ type: "single", part });
    } else {
      // Non-tool part — flush context group and add as single
      flushContext();
      result.push({ type: "single", part });
    }
  }

  flushContext();
  return result;
}
