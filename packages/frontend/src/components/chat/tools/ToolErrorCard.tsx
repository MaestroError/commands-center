import { useState } from "react";
import { ChevronRight, TriangleAlert } from "lucide-react";

import type { ConversationPart } from "@cc/shared/schemas";
import { CopyIdButton } from "../CopyIdButton";
import { getToolName, getToolState } from "./tool-registry";

type ToolErrorCardProps = {
  part: ConversationPart;
};

export function ToolErrorCard({ part }: ToolErrorCardProps) {
  const [expanded, setExpanded] = useState(false);
  const toolName = getToolName(part);
  const state = getToolState(part);
  const error = state?.["error"];
  const errorText = typeof error === "string" ? error : JSON.stringify(error, null, 2);
  const canExpand = Boolean(errorText);

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
          <span className="tool-status error tool-status--dot" title="Error">
            <span className="sdot" />
            <span className="sr-only">Error</span>
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
        <div className="tool-body space-y-2">
          <div>
            <p className="text-xs font-medium text-text-secondary mb-1">Tool</p>
            <p className="tool-detail-name">{toolName}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-text-secondary mb-1">Status</p>
            <p className="tool-detail-status error">Error</p>
          </div>
          <div className="relative">
            <pre className="text-xs bg-surface-elevated rounded-md p-3 overflow-auto max-h-60 text-danger whitespace-pre-wrap">
              {errorText}
            </pre>
            <CopyIdButton
              className="absolute top-2 right-2 rounded-md bg-surface p-1 text-text-secondary transition hover:text-text-primary"
              label="error"
              value={errorText ?? ""}
            />
          </div>
        </div>
      )}
    </div>
  );
}
