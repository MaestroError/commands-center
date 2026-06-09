import { useState, useCallback } from "react";
import { ChevronRight, TriangleAlert } from "lucide-react";

import type { ConversationPart } from "@cc/shared/schemas";
import { CopyIdButton } from "../CopyIdButton";
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
  const canExpand = Boolean(errorText);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(errorText ?? "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [errorText]);

  return (
    <div className={`tool tool--error ${expanded ? "open" : ""}`}>
      <div className="tool-row">
        <button
          type="button"
          aria-expanded={canExpand ? expanded : undefined}
          className={`tool-trigger ${canExpand ? "" : "static"}`}
          onClick={() => canExpand && setExpanded((prev) => !prev)}
        >
          <span className="tool-ico">
            <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />
          </span>
          <span className="tool-name">{toolName}</span>
          <span className="tool-spacer" />
          <span className="tool-status error">
            <span className="sdot" />
            Error
          </span>
          {canExpand ? (
            <span className="tool-chev">
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </span>
          ) : null}
        </button>
        <CopyIdButton label={`tool id ${toolName}`} value={toolName} />
      </div>

      {expanded && canExpand && (
        <div className="tool-body relative">
          <pre className="text-xs bg-surface-elevated rounded-md p-3 overflow-auto max-h-60 text-danger whitespace-pre-wrap">
            {errorText}
          </pre>
          <button
            type="button"
            className="absolute top-2 right-2 rounded-md bg-surface px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition"
            onClick={handleCopy}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
