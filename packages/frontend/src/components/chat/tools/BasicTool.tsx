import { useState, type ReactNode } from "react";
import { ChevronRight, Wrench, X } from "lucide-react";

import type { ConversationPart } from "@cc/shared/schemas";

import { CopyIdButton } from "../CopyIdButton";
import { ToolUsageInfoButton } from "../UsageInfoButton";
import { useCancellableTool } from "./use-cancellable-tool";

type BasicToolProps = {
  title: string;
  subtitle?: string;
  status?: string;
  icon?: ReactNode;
  defaultExpanded?: boolean;
  hideDetails?: boolean;
  copyValue?: string;
  /** The tool call's id (`part.callID`). Lets the status dot become a cancel button when this call is blocked on the user. */
  callId?: string;
  /** The tool part itself, when the caller has it. Adds the timing info button to the row. */
  part?: ConversationPart;
  children?: ReactNode;
};

function statusPill(status?: string): { label: string; cls: string } | null {
  switch (status) {
    case "completed":
      return { label: "Completed", cls: "completed" };
    case "pending":
    case "running":
      return { label: "Running", cls: "running" };
    case "error":
      return { label: "Error", cls: "error" };
    default:
      return null;
  }
}

export function BasicTool({
  title,
  subtitle,
  status,
  icon,
  defaultExpanded = false,
  hideDetails = false,
  copyValue,
  callId,
  part,
  children,
}: BasicToolProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const pill = statusPill(status);
  const canExpand = !hideDetails && Boolean(children);
  const isWaiting = status === "pending" || status === "running";
  const cancel = useCancellableTool(callId);
  const cancellable = isWaiting && Boolean(cancel);

  return (
    <div className={`tool ${expanded ? "open" : ""}`}>
      <div className="tool-row">
        <button
          type="button"
          aria-expanded={canExpand ? expanded : undefined}
          className={`tool-trigger ${canExpand ? "" : "static"}`}
          onClick={() => canExpand && setExpanded((prev) => !prev)}
        >
          <span className="tool-ico">
            {icon ?? <Wrench aria-hidden="true" className="h-3.5 w-3.5" />}
          </span>
          <span className="tool-name">{title}</span>
          {subtitle ? <span className="tool-arg">{subtitle}</span> : null}
          <span className="tool-spacer" />
          {canExpand ? (
            <span className="tool-chev">
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </span>
          ) : null}
        </button>
        {pill ? (
          cancellable ? (
            <button
              type="button"
              className={`tool-status ${pill.cls} tool-status--dot tool-status--cancellable`}
              title="Cancel"
              aria-label="Cancel tool call"
              onClick={(event) => {
                event.stopPropagation();
                cancel?.();
              }}
            >
              <span className="sdot" />
              <span className="tool-status-cancel-icon">
                <X aria-hidden="true" className="h-2.5 w-2.5" />
              </span>
              <span className="sr-only">Cancel tool call</span>
            </button>
          ) : (
            <span className={`tool-status ${pill.cls} tool-status--dot`} title={pill.label}>
              <span className="sdot" />
              <span className="sr-only">{pill.label}</span>
            </span>
          )
        ) : null}
        {part ? <ToolUsageInfoButton part={part} toolName={title} /> : null}
        {copyValue ? <CopyIdButton label={`tool id ${title}`} value={copyValue} /> : null}
      </div>

      {expanded && canExpand ? (
        <div className="tool-body space-y-2">
          <div>
            <p className="text-xs font-medium text-text-secondary mb-1">Tool</p>
            <p className="tool-detail-name">{title}</p>
          </div>
          {pill ? (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1">Status</p>
              <p className={`tool-detail-status ${pill.cls}`}>{pill.label}</p>
            </div>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
