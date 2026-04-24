import { useState, type ReactNode } from "react";
import { CopyIdButton } from "../CopyIdButton";
import { getStatusDisplay } from "./tool-registry";

type BasicToolProps = {
  title: string;
  subtitle?: string;
  status?: string;
  defaultExpanded?: boolean;
  hideDetails?: boolean;
  copyValue?: string;
  children?: ReactNode;
};

export function BasicTool({
  title,
  subtitle,
  status,
  defaultExpanded = false,
  hideDetails = false,
  copyValue,
  children,
}: BasicToolProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { label, className } = getStatusDisplay(status);
  const canExpand = !hideDetails && children;

  return (
    <div className="border border-border rounded-md">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          className={`flex flex-1 items-center gap-2 text-left transition rounded-md ${
            canExpand ? "hover:bg-accent/5 cursor-pointer" : "cursor-default"
          }`}
          onClick={() => canExpand && setExpanded((prev) => !prev)}
        >
          {canExpand && (
            <span className="text-text-secondary text-sm">{expanded ? "\u25BE" : "\u25B8"}</span>
          )}
          <span className="text-sm font-medium text-text-primary flex-1 truncate">{title}</span>
          {subtitle && (
            <span className="text-xs text-text-secondary truncate max-w-[40%]">{subtitle}</span>
          )}
          {label && <span className={`text-xs font-medium ${className}`}>{label}</span>}
        </button>
        {copyValue ? <CopyIdButton label={`tool id ${title}`} value={copyValue} /> : null}
      </div>

      {expanded && children && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}
