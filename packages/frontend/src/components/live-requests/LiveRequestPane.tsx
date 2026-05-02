import { useEffect, useState } from "react";

import type { LiveRequest, LiveRequestAction } from "@cc/shared/schemas";

type Props = {
  request: LiveRequest;
  onResolve?: (requestId: string, action: string, values: Record<string, string>) => Promise<void>;
  onCancel?: (requestId: string, reason?: string) => Promise<void>;
};

export function LiveRequestPane(props: Props) {
  const { request } = props;
  const [values, setValues] = useState<Record<string, string>>(() => getInitialValues(request));
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const actions = request.actions.length > 0 ? request.actions : getFallbackActions(request);

  useEffect(() => {
    setValues(getInitialValues(request));
    setBusy(false);
    setErrorMessage(undefined);
  }, [request]);

  async function handleAction(action: LiveRequestAction): Promise<void> {
    if (busy) {
      return;
    }

    if (action.kind === "cancel") {
      await handleCancel();
      return;
    }

    if (!props.onResolve) {
      return;
    }

    const missing = request.fields.find((field) => field.required && !values[field.name]?.trim());

    if (missing) {
      setErrorMessage(`${missing.label} is required.`);
      return;
    }

    setBusy(true);
    setErrorMessage(undefined);

    try {
      await props.onResolve(request.id, action.id, values);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to submit request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(): Promise<void> {
    if (!props.onCancel || busy) {
      return;
    }

    setBusy(true);
    setErrorMessage(undefined);

    try {
      await props.onCancel(request.id, "Cancelled by operator.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to cancel request.");
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-[24rem] flex-col bg-background p-6">
      <div className="mx-auto w-full max-w-2xl rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Agent waiting</p>
          <h2 className="mt-2 text-xl font-semibold text-text-primary">
            {request.presentation.title}
          </h2>
          {request.presentation.description ? (
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {request.presentation.description}
            </p>
          ) : null}
        </div>

        <div className="space-y-4">
          {request.fields.map((field) => (
            <label className="block" key={field.name}>
              <span className="text-sm font-medium text-text-primary">{field.label}</span>
              {field.description ? (
                <span className="mt-1 block text-xs text-text-secondary">{field.description}</span>
              ) : null}
              {field.type === "textarea" ? (
                <textarea
                  className="mt-2 min-h-28 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                  disabled={busy}
                  placeholder={field.placeholder}
                  value={values[field.name] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                />
              ) : (
                <input
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                  disabled={busy}
                  placeholder={field.placeholder}
                  type={field.type === "password" ? "password" : "text"}
                  value={values[field.name] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                />
              )}
            </label>
          ))}
        </div>

        {errorMessage ? <p className="mt-4 text-sm text-destructive">{errorMessage}</p> : null}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {actions.map((action) => (
            <button
              className={getActionClassName(action)}
              disabled={busy || isActionDisabled(action, values)}
              key={action.id}
              type="button"
              onClick={() => void handleAction(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function getInitialValues(request: LiveRequest): Record<string, string> {
  return Object.fromEntries(
    request.fields.map((field) => [
      field.name,
      "defaultValue" in field && typeof field.defaultValue === "string" ? field.defaultValue : "",
    ]),
  );
}

function getFallbackActions(request: LiveRequest): LiveRequestAction[] {
  return [
    {
      id: "submit",
      label: request.presentation.submitLabel ?? "Submit",
      variant: "primary",
      kind: "submit",
      disabledWhen: [],
    },
    {
      id: "cancel",
      label: request.presentation.cancelLabel,
      variant: "secondary",
      kind: "cancel",
      disabledWhen: [],
    },
  ];
}

function getActionClassName(action: LiveRequestAction): string {
  if (action.variant === "primary") {
    return "cc-button";
  }

  if (action.variant === "danger") {
    return "cc-button border-destructive/40 text-destructive hover:bg-destructive/10";
  }

  return "cc-button cc-button-secondary";
}

function isActionDisabled(action: LiveRequestAction, values: Record<string, string>): boolean {
  return action.disabledWhen.some((condition) => {
    const value = values[condition.field] ?? "";

    if (condition.rule === "field_empty") {
      return value.trim().length === 0;
    }

    if (condition.rule === "field_slug_equals") {
      return slugify(value) === slugify(condition.value);
    }

    return slugify(value) !== slugify(condition.value);
  });
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug || "tool";
}
