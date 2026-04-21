import { useState } from "react";
import type { ConversationPart } from "@cc/shared/schemas";
import { getToolName, getToolInput, getToolState } from "./tool-registry";

type ContextGroupProps = {
  parts: ConversationPart[];
};

function countByCategory(parts: ConversationPart[]): { reads: number; searches: number } {
  let reads = 0;
  let searches = 0;
  for (const part of parts) {
    const name = getToolName(part);
    if (name === "read" || name === "list") reads++;
    else if (name === "glob" || name === "grep") searches++;
  }
  return { reads, searches };
}

function getPartSummary(part: ConversationPart): string {
  const name = getToolName(part);
  const input = getToolInput(part);

  if (name === "read") {
    return (input?.["path"] as string) ?? (input?.["filePath"] as string) ?? "file";
  }
  if (name === "list") {
    return (input?.["path"] as string) ?? (input?.["directory"] as string) ?? "directory";
  }
  if (name === "glob") {
    return (input?.["pattern"] as string) ?? (input?.["glob"] as string) ?? "pattern";
  }
  if (name === "grep") {
    return (input?.["pattern"] as string) ?? (input?.["query"] as string) ?? "search";
  }
  return name;
}

function isAllCompleted(parts: ConversationPart[]): boolean {
  return parts.every((p) => {
    const state = getToolState(p);
    return state?.["status"] === "completed";
  });
}

export function ContextGroup({ parts }: ContextGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const { reads, searches } = countByCategory(parts);
  const completed = isAllCompleted(parts);

  const counts: string[] = [];
  if (reads > 0) counts.push(`${String(reads)} read${reads > 1 ? "s" : ""}`);
  if (searches > 0) counts.push(`${String(searches)} search${searches !== 1 ? "es" : ""}`);
  const summary = counts.join(", ");

  return (
    <div className="border border-border rounded-md">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/5 transition rounded-md"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="text-text-secondary text-sm">{expanded ? "\u25BE" : "\u25B8"}</span>
        <span className="text-sm font-medium text-text-primary flex-1">
          {completed ? "Gathered context" : "Gathering context"}
        </span>
        <span className="text-xs text-text-secondary">{summary}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {parts.map((part) => {
            const name = getToolName(part);
            const label = getPartSummary(part);
            const state = getToolState(part);
            const status = state?.["status"] as string | undefined;

            return (
              <div key={part.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs">
                <span className="font-medium text-text-secondary w-12 shrink-0">{name}</span>
                <span className="text-text-primary truncate flex-1 font-mono">{label}</span>
                {status === "completed" ? (
                  <span className="text-success shrink-0">✓</span>
                ) : status === "error" ? (
                  <span className="text-danger shrink-0">✗</span>
                ) : (
                  <span className="text-info shrink-0 animate-pulse">…</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
