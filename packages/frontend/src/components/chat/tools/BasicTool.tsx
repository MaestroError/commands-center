import { useState, type ReactNode } from "react";
import { ChevronRight, Wrench } from "lucide-react";

import { CopyIdButton } from "../CopyIdButton";

type BasicToolProps = {
  title: string;
  subtitle?: string;
  status?: string;
  icon?: ReactNode;
  defaultExpanded?: boolean;
  hideDetails?: boolean;
  copyValue?: string;
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
  children,
}: BasicToolProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const pill = statusPill(status);
  const canExpand = !hideDetails && Boolean(children);

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
          {pill ? (
            <span className={`tool-status ${pill.cls}`}>
              <span className="sdot" />
              {pill.label}
            </span>
          ) : null}
          {canExpand ? (
            <span className="tool-chev">
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </span>
          ) : null}
        </button>
        {copyValue ? <CopyIdButton label={`tool id ${title}`} value={copyValue} /> : null}
      </div>

      {expanded && canExpand ? <div className="tool-body space-y-2">{children}</div> : null}
    </div>
  );
}
