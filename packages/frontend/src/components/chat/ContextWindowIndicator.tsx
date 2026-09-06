import type { CSSProperties } from "react";

import type { ConversationMessage, ConversationPart, Provider } from "@cc/shared/schemas";

import { cn } from "@/lib/cn";

import { UsageInfoButton } from "./UsageInfoButton";
import { formatContextCount, formatContextSummary, readContextWindow } from "./context-window";

type ContextWindowIndicatorProps = {
  messages: ConversationMessage[];
  parts: Record<string, ConversationPart[]>;
  providers: Provider[];
  fallbackModel?: string;
};

/** Fractions at which a filling window stops being background information. */
const WARN_AT = 0.75;
const DANGER_AT = 0.9;

/**
 * A small ring in the chat header showing how full the model's context window
 * is. Deliberately quiet — it earns attention only by colour as it fills.
 */
export function ContextWindowIndicator(props: ContextWindowIndicatorProps) {
  const context = readContextWindow({
    messages: props.messages,
    parts: props.parts,
    providers: props.providers,
    ...(props.fallbackModel === undefined ? {} : { fallbackModel: props.fallbackModel }),
  });

  if (!context) return null;

  const summary = formatContextSummary(context);

  return (
    <UsageInfoButton
      className="h-8 w-8 rounded-md opacity-100 hover:bg-surface-elevated"
      icon={
        <span
          aria-hidden="true"
          className={cn(
            "cc-context-ring",
            context.fraction >= DANGER_AT
              ? "cc-context-ring--danger"
              : context.fraction >= WARN_AT
                ? "cc-context-ring--warn"
                : "",
          )}
          style={{ "--cc-context-turn": context.fraction } as CSSProperties}
        />
      }
      label={`Context ${summary}`}
      rows={[
        { label: "Used", value: formatContextCount(context.usedTokens) },
        { label: "Limit", value: formatContextCount(context.limitTokens) },
        { label: "Model", value: context.model, detail: true },
      ]}
      title={`Context ${summary}`}
    />
  );
}
