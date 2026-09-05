import { useState } from "react";
import { Info, X } from "lucide-react";

import type { ConversationMessage, ConversationPart } from "@cc/shared/schemas";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

import {
  buildMessageUsageRows,
  buildToolUsageRows,
  readMessageUsage,
  readToolUsage,
  type UsageRow,
} from "./usage-stats";

type UsageInfoButtonProps = {
  /** Modal heading, e.g. "Message usage" or a tool name. */
  title: string;
  rows: UsageRow[];
  /** Screen-reader name for the trigger; also the fallback tooltip label. */
  label: string;
  className?: string;
};

/**
 * The faint "i" that reveals token and timing figures for a message or tool
 * call. Hover (or keyboard focus) is the desktop path and opens a tooltip;
 * clicking or tapping opens the same figures in a dialog, which is the only
 * path touch devices get since pointer hover never fires there.
 */
export function UsageInfoButton({ title, rows, label, className }: UsageInfoButtonProps) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (rows.length === 0) {
    return null;
  }

  // The hover card carries the figures worth glancing at; exact timestamps stay
  // in the dialog. A row set that is nothing but detail (a still-running tool,
  // which only has a start time) keeps all of it rather than showing nothing.
  const withoutDetail = rows.filter((row) => !row.detail);
  const glanceRows = withoutDetail.length > 0 ? withoutDetail : rows;

  return (
    <>
      <Tooltip
        // Suppress the hover card while the dialog is up: the trigger keeps
        // focus underneath, which would otherwise hold the tooltip open behind
        // the overlay.
        open={tooltipOpen && !dialogOpen}
        onOpenChange={setTooltipOpen}
      >
        <TooltipTrigger asChild>
          <button
            aria-label={label}
            className={cn(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-secondary opacity-30 transition",
              "hover:text-text-primary hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100",
              className,
            )}
            onClick={() => {
              setTooltipOpen(false);
              setDialogOpen(true);
            }}
            type="button"
          >
            <Info aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-none">
          <UsageRows compact rows={glanceRows} title={title} />
        </TooltipContent>
      </Tooltip>

      {dialogOpen ? (
        <Dialog onOpenChange={setDialogOpen} open>
          <DialogContent aria-label={label} className="max-w-sm gap-0 p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <DialogTitle className="text-sm">{title}</DialogTitle>
              <button
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
                onClick={() => setDialogOpen(false)}
                type="button"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="p-4">
              <UsageRows rows={rows} />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

/** Timing for a single tool call, read off its `state.time`. */
export function ToolUsageInfoButton(props: { part: ConversationPart; toolName: string }) {
  const usage = readToolUsage(props.part);
  if (!usage) return null;

  return (
    <UsageInfoButton
      label={`Timing for ${props.toolName}`}
      rows={buildToolUsageRows(usage)}
      title={props.toolName}
    />
  );
}

/** Tokens, cost and duration for one assistant message. */
export function MessageUsageInfoButton(props: {
  message: ConversationMessage;
  parts: ConversationPart[];
}) {
  const usage = readMessageUsage(props.message, props.parts);
  if (!usage) return null;

  return (
    <UsageInfoButton
      className="mt-1 h-7 w-7 border border-border hover:border-accent/50"
      label="Message tokens and timing"
      rows={buildMessageUsageRows(usage)}
      title="Message usage"
    />
  );
}

function UsageRows(props: { rows: UsageRow[]; title?: string; compact?: boolean }) {
  return (
    <div className={props.compact ? "min-w-40" : ""}>
      {props.title ? (
        <p className="mb-1 text-xs font-semibold text-text-primary">{props.title}</p>
      ) : null}
      <dl
        className={cn("grid grid-cols-[auto_1fr] gap-x-4", props.compact ? "gap-y-0.5" : "gap-y-2")}
      >
        {props.rows.map((row) => (
          <div className="contents" key={row.label}>
            <dt className="text-xs text-text-secondary">{row.label}</dt>
            <dd className="text-right text-xs font-medium tabular-nums text-text-primary">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
