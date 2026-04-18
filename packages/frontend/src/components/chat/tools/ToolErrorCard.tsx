import { useState, useCallback } from "react";
import type { ConversationPart } from "@cc/shared/schemas";
import { getToolName, getToolState } from "./tool-registry";

type ToolErrorCardProps = {
  part: ConversationPart;
};

export function ToolErrorCard({ part }: ToolErrorCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const toolName = getToolName(part);
  const state = getToolState(part);
  const error = state?.["error"];
  const errorText = typeof error === "string" ? error : JSON.stringify(error, null, 2);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(errorText ?? "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [errorText]);

  return (
    <div className="border border-danger/30 rounded-xl bg-danger/5">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-danger/10 transition rounded-xl"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="text-danger text-sm">{expanded ? "\u25BE" : "\u25B8"}</span>
        <span className="text-sm font-medium text-danger flex-1 truncate">{toolName}</span>
        <span className="text-xs font-medium text-danger">Error</span>
      </button>

      {expanded && errorText && (
        <div className="px-3 pb-3 relative">
          <pre className="text-xs bg-surface rounded-xl p-3 overflow-auto max-h-60 text-danger whitespace-pre-wrap">
            {errorText}
          </pre>
          <button
            type="button"
            className="absolute top-2 right-5 rounded-md bg-surface-elevated px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition"
            onClick={handleCopy}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
