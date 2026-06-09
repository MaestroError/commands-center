import { useState } from "react";
import { Check, ChevronRight, Layers, Loader } from "lucide-react";
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
    <div className={`tool ${expanded ? "open" : ""}`}>
      <div className="tool-row">
        <button
          type="button"
          aria-expanded={expanded}
          className="tool-trigger"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <span className="tool-ico">
            <Layers aria-hidden="true" className="h-3.5 w-3.5" />
          </span>
          <span className="tool-title">{completed ? "Gathered context" : "Gathering context"}</span>
          <span className="tool-spacer" />
          {summary ? <span className="tool-count">{summary}</span> : null}
          <span className="tool-chev">
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </span>
        </button>
      </div>

      {expanded && (
        <div className="tool-body space-y-1">
          {parts.map((part) => {
            const name = getToolName(part);
            const label = getPartSummary(part);
            const state = getToolState(part);
            const status = state?.["status"] as string | undefined;

            return (
              <div key={part.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-xs">
                <span className="font-medium text-text-secondary w-12 shrink-0">{name}</span>
                <span className="text-text-primary truncate flex-1 font-mono">{label}</span>
                {status === "completed" ? (
                  <>
                    <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-success" />
                    <span className="sr-only">completed</span>
                  </>
                ) : status === "error" ? (
                  <>
                    <span aria-hidden="true" className="text-danger shrink-0">
                      ✗
                    </span>
                    <span className="sr-only">failed</span>
                  </>
                ) : (
                  <>
                    <Loader
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 animate-spin text-info"
                    />
                    <span className="sr-only">running</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
