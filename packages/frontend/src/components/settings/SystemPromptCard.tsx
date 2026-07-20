import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { SystemPromptListItem, SystemPromptVariableMeta } from "@cc/shared/schemas";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { MonacoFileEditor } from "@/components/workspace/MonacoFileEditor";
import {
  useResetSystemPromptMutation,
  useSaveSystemPromptMutation,
  useSystemPromptQuery,
} from "@/hooks/use-system-prompts-query";

import { SystemPromptVariablePills } from "./SystemPromptVariablePills";
import { Button } from "@/components/ui/button";

type SystemPromptCardProps = {
  prompt: SystemPromptListItem;
  variables: SystemPromptVariableMeta[];
};

const DANGER_NOTE = "Editing this affects every specialist and core behaviour.";

export function SystemPromptCard({ prompt, variables }: SystemPromptCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const detailQuery = useSystemPromptQuery(prompt.id, expanded);
  const saveMutation = useSaveSystemPromptMutation(prompt.id);
  const resetMutation = useResetSystemPromptMutation(prompt.id);

  const detail = detailQuery.data;
  const baseline = detail?.body ?? "";
  const isCustomized = detail?.isCustomized ?? prompt.isCustomized;

  // Reset the editor draft whenever the loaded body changes (initial load,
  // reload, save, or reset-to-default).
  useEffect(() => {
    if (detail) {
      setDraft(detail.body);
    }
  }, [detail]);

  const dirty = draft !== null && draft !== baseline;
  const busy = saveMutation.isPending || resetMutation.isPending;
  const errorMessage =
    saveMutation.error instanceof Error
      ? saveMutation.error.message
      : resetMutation.error instanceof Error
        ? resetMutation.error.message
        : undefined;

  return (
    <div className="cc-panel overflow-hidden">
      <div className="flex items-start gap-2 p-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary"
            />
          ) : (
            <ChevronRight
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">{prompt.title}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  isCustomized ? "bg-accent/10 text-accent" : "bg-surface text-text-secondary"
                }`}
              >
                {isCustomized ? "Customized" : "Default"}
              </span>
            </div>
            <p className="mt-1 text-xs text-text-secondary">{prompt.description}</p>
            {prompt.danger ? (
              <p className="mt-1 text-xs font-medium text-danger">{DANGER_NOTE}</p>
            ) : null}
          </div>
        </button>
      </div>

      {expanded ? (
        <div className="border-t border-border p-4">
          {detailQuery.isLoading || draft === null ? (
            <p className="py-6 text-center text-sm text-text-secondary">Loading…</p>
          ) : detailQuery.error ? (
            <p className="py-6 text-center text-sm text-danger">Failed to load this prompt.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {variables.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-xs text-text-secondary">
                    Variables (click to copy the token):
                  </p>
                  <SystemPromptVariablePills variables={variables} />
                </div>
              ) : null}

              {prompt.optional ? (
                <p className="text-xs italic text-text-secondary">
                  An empty Additional prompt is simply not sent.
                </p>
              ) : null}

              {/* Definite height: MonacoFileEditor's root uses h-full, so without
                  a sized parent the editor collapses to a sliver. */}
              <div className="h-[28rem] overflow-hidden rounded-md border border-border">
                <MonacoFileEditor
                  name={`${prompt.id}.md`}
                  path={`configuration/system-prompts/${prompt.id}.md`}
                  showPathLabel={false}
                  mimeType="text/markdown"
                  draft={draft}
                  baseline={baseline}
                  isWritable
                  dirty={dirty}
                  busy={busy}
                  errorMessage={errorMessage}
                  conflict={undefined}
                  onDraftChange={setDraft}
                  onSaveRequested={() => saveMutation.mutate(draft)}
                  onReloadRequested={() => void detailQuery.refetch()}
                  onDiscardConflict={() => undefined}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  variant="danger"
                  type="button"
                  disabled={busy || !isCustomized}
                  onClick={() => setConfirmingReset(true)}
                  title={
                    isCustomized
                      ? "Delete the saved file and restore the shipped default"
                      : "Already using the shipped default"
                  }
                >
                  Reset to default
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {confirmingReset ? (
        <ConfirmDialog
          title={`Reset ${prompt.title} to default?`}
          description="This deletes your saved version and restores the shipped default. This cannot be undone."
          confirmLabel="Reset to default"
          confirmVariant="danger"
          onConfirm={() => {
            setConfirmingReset(false);
            resetMutation.mutate();
          }}
          onCancel={() => setConfirmingReset(false)}
        />
      ) : null}
    </div>
  );
}
