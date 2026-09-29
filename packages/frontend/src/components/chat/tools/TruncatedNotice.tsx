import type { ConversationPart } from "@cc/shared/schemas";

import { useFullParts } from "./use-full-parts";

type TruncatedNoticeProps = {
  part: ConversationPart;
  field: "output" | "error";
};

/**
 * Shown under a tool value the conversation payload cut to a preview, with the
 * action that fetches the rest.
 */
export function TruncatedNotice({ part, field }: TruncatedNoticeProps) {
  const { truncated, fullLength, loading, error, load } = useFullParts(part, field);

  if (!truncated) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
      <span>
        Showing the first part
        {fullLength ? ` of ${fullLength.toLocaleString("en-US")} characters` : ""}.
      </span>
      <button
        className="rounded-sm text-accent underline-offset-2 transition hover:underline disabled:opacity-60"
        disabled={loading}
        onClick={load}
        type="button"
      >
        {loading ? "Loading…" : `Show full ${field}`}
      </button>
      {error ? <span className="text-danger">{error}</span> : null}
    </div>
  );
}
