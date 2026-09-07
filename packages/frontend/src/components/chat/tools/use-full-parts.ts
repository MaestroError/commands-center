import { useCallback, useContext, useState } from "react";

import type { ConversationPart } from "@cc/shared/schemas";

import { FullPartsContext } from "./full-parts-context";

type TruncatedField = "output" | "error";

/**
 * Truncation state for one tool part, plus the loader that replaces it with the
 * full value. Returns `truncated: false` when the part arrived whole, which is
 * the common case for anything under the preview limit.
 */
export function useFullParts(part: ConversationPart, field: TruncatedField) {
  const context = useContext(FullPartsContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = part["state"];
  const record =
    state && typeof state === "object" ? (state as Record<string, unknown>) : undefined;
  const truncated = record?.[`${field}Truncated`] === true;
  const rawLength = record?.[`${field}Length`];
  const fullLength = typeof rawLength === "number" ? rawLength : undefined;
  const messageId = typeof part["messageID"] === "string" ? part["messageID"] : undefined;

  const load = useCallback(async () => {
    if (!context || !messageId) return;

    setLoading(true);
    setError(null);
    try {
      await context.loadFullParts(messageId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the full output.");
    } finally {
      setLoading(false);
    }
  }, [context, messageId]);

  return {
    truncated: truncated && Boolean(context) && Boolean(messageId),
    fullLength,
    loading,
    error,
    load: () => void load(),
  };
}
