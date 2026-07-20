import { useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";

import type { ResolvedSystemPrompt } from "@cc/shared/schemas";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type SystemPromptsModalProps = {
  prompts: ResolvedSystemPrompt[];
  /** True when the prompts are the conversation's current config, not the
   * snapshot captured at send time (older messages). */
  isFallback?: boolean;
  onClose: () => void;
};

export function SystemPromptsModal({ prompts, isFallback, onClose }: SystemPromptsModalProps) {
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent
        aria-label="System prompts sent with this message"
        className="top-20 max-h-[70vh] max-w-lg translate-y-0 overflow-hidden p-0"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <DialogTitle className="text-sm">System prompts</DialogTitle>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
            onClick={onClose}
            aria-label="Close"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>

        {isFallback ? (
          <p className="border-b border-border bg-surface-elevated px-4 py-2 text-xs text-text-secondary">
            Current configuration (not captured at send time).
          </p>
        ) : null}

        <div className="flex flex-col gap-2 overflow-y-auto p-3">
          {prompts.length === 0 ? (
            <p className="px-1 py-4 text-center text-sm text-text-secondary">
              No system prompts were sent with this message.
            </p>
          ) : (
            prompts.map((prompt) => <PromptSection key={prompt.id} prompt={prompt} />)
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PromptSection({ prompt }: { prompt: ResolvedSystemPrompt }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-border bg-surface">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
        ) : (
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
        )}
        <span className="truncate text-sm font-medium text-text-primary">{prompt.title}</span>
      </button>
      {expanded ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border-t border-border px-3 py-2 text-xs text-text-primary">
          {prompt.renderedBody}
        </pre>
      ) : null}
    </div>
  );
}
