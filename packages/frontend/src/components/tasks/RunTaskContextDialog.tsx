import { useState } from "react";

import type { TriggerTaskInput } from "@cc/shared/schemas";

type Props = {
  taskTitle: string;
  busy?: boolean;
  onCancel: () => void;
  onRun: (input?: Partial<TriggerTaskInput>) => void;
};

export function RunTaskContextDialog(props: Props) {
  const [contextText, setContextText] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/80 p-4 backdrop-blur-sm">
      <section className="cc-panel w-full max-w-xl p-5" role="dialog" aria-modal="true">
        <div>
          <p className="text-xs font-medium tracking-wide text-text-secondary uppercase">
            Run task
          </p>
          <h2 className="mt-1 text-xl font-semibold text-text-primary">{props.taskTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Add optional context for this run only. It will be saved on the run history and will not
            change the task definition.
          </p>
        </div>

        <label className="mt-4 grid gap-1 text-sm text-text-secondary">
          Run context
          <textarea
            className="cc-input min-h-32 resize-y"
            placeholder="Anything the agent should know for this specific run..."
            value={contextText}
            onChange={(event) => setContextText(event.target.value)}
          />
        </label>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            className="cc-button cc-button-secondary"
            disabled={props.busy}
            onClick={props.onCancel}
            type="button"
          >
            Cancel
          </button>
          <button className="cc-button" disabled={props.busy} onClick={handleRun} type="button">
            Run task
          </button>
        </div>
      </section>
    </div>
  );

  function handleRun() {
    const text = contextText.trim();
    props.onRun(text ? { context: { text } } : undefined);
  }
}
