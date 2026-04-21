import { useState } from "react";

import type { ConversationPart } from "@cc/shared/schemas";

type ToolCallCardProps = {
  part: ConversationPart;
};

function getStatusDisplay(part: ConversationPart): { label: string; className: string } {
  const stateRaw = part["state"] as Record<string, unknown> | undefined;
  const status = stateRaw?.["status"];

  switch (status) {
    case "pending":
    case "running":
      return { label: "Running", className: "text-info" };
    case "completed":
      return { label: "Completed", className: "text-success" };
    case "error":
      return { label: "Error", className: "text-danger" };
    default:
      return { label: "Unknown", className: "text-text-secondary" };
  }
}

function getToolState(part: ConversationPart): Record<string, unknown> | undefined {
  return part["state"] as Record<string, unknown> | undefined;
}

export function ToolCallCard({ part }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const toolName =
    (part["tool"] as string | undefined) ?? (part["name"] as string | undefined) ?? "Tool";

  const { label, className } = getStatusDisplay(part);
  const state = getToolState(part);

  const input = state?.["input"];
  const output = state?.["output"];
  const error = state?.["error"];

  return (
    <div className="border border-border rounded-md">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/5 transition rounded-md"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="text-text-secondary text-sm">{expanded ? "\u25BE" : "\u25B8"}</span>
        <span className="text-sm font-medium text-text-primary flex-1 truncate">{toolName}</span>
        <span className={`text-xs font-medium ${className}`}>{label}</span>
      </button>

      {expanded ? (
        <div className="px-3 pb-3 space-y-2">
          {input !== undefined ? (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1">Input</p>
              <pre className="text-xs bg-surface rounded-md p-3 overflow-auto max-h-60 text-text-primary">
                {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
              </pre>
            </div>
          ) : null}

          {output !== undefined ? (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1">Output</p>
              <pre className="text-xs bg-surface rounded-md p-3 overflow-auto max-h-60 text-text-primary">
                {typeof output === "string" ? output : JSON.stringify(output, null, 2)}
              </pre>
            </div>
          ) : null}

          {error !== undefined ? (
            <div>
              <p className="text-xs font-medium text-danger mb-1">Error</p>
              <pre className="text-xs bg-surface rounded-md p-3 overflow-auto max-h-60 text-danger">
                {typeof error === "string" ? error : JSON.stringify(error, null, 2)}
              </pre>
            </div>
          ) : null}

          {input === undefined && output === undefined && error === undefined ? (
            <p className="text-xs text-text-secondary">No details available.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
