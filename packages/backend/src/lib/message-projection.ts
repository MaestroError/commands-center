import type { ConversationPart } from "@cc/shared/schemas";

/**
 * Trims message parts down to what the timeline actually renders.
 *
 * A conversation's stored parts are far larger than what any view reads. On a
 * real workspace, `tool.state.metadata` was 56% of all part bytes and only the
 * question tool's renderer looks at it; `reasoning` bodies were another 12% and
 * nothing renders them at all. Sending that on every conversation load is the
 * bulk of the payload.
 *
 * Nothing is lost — the full parts stay in the database, and the message parts
 * endpoint serves them untrimmed when a tool card is expanded.
 */

/** Longest tool output or error sent inline, in characters. */
export const TOOL_TEXT_PREVIEW_LIMIT = 2_000;

/** Tools whose renderers read `state.metadata`; every other tool's is dropped. */
const METADATA_TOOLS = new Set(["question"]);

/** Marks a value the client can request in full from the message parts endpoint. */
const TRUNCATED_FLAGS = {
  output: "outputTruncated",
  error: "errorTruncated",
} as const;

export function projectPartForList(part: ConversationPart): ConversationPart {
  if (part.type === "reasoning") {
    // Never rendered (see HIDDEN_PART_TYPES); keep the shell so part counts and
    // ordering are unchanged, drop the body.
    const { text: _text, ...rest } = part as ConversationPart & { text?: unknown };
    return typeof (part as { text?: unknown }).text === "string"
      ? { ...rest, textTruncated: true }
      : part;
  }

  if (part.type !== "tool" || !isRecord(part["state"])) {
    return part;
  }

  const tool = typeof part["tool"] === "string" ? part["tool"] : "";
  const state: Record<string, unknown> = { ...part["state"] };

  if (!METADATA_TOOLS.has(tool)) {
    delete state["metadata"];
  }

  for (const [field, flag] of Object.entries(TRUNCATED_FLAGS)) {
    const value = state[field];
    if (typeof value !== "string" || value.length <= TOOL_TEXT_PREVIEW_LIMIT) continue;

    state[field] = value.slice(0, TOOL_TEXT_PREVIEW_LIMIT);
    state[flag] = true;
    state[`${field}Length`] = value.length;
  }

  return { ...part, state };
}

export function projectPartsForList(parts: ConversationPart[]): ConversationPart[] {
  return parts.map(projectPartForList);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
