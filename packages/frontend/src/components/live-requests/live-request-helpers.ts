import type { LiveRequest, LiveRequestAction } from "@cc/shared/schemas";

/**
 * True for any agent/task draft review live request — any kind ending in `_review` that
 * starts with `agent_` or `task_` (create, update, queue, schedule, template, ...). These
 * render the compact `LiveRequestReviewForm`; everything else (confirmations, add_secret,
 * custom-tool prompts) keeps the generic `LiveRequestPane`.
 */
export function isLiveRequestReviewKind(kind: string): boolean {
  return kind.endsWith("_review") && (kind.startsWith("agent_") || kind.startsWith("task_"));
}

export function getInitialValues(request: LiveRequest): Record<string, string> {
  return Object.fromEntries(
    request.fields.map((field) => [
      field.name,
      "defaultValue" in field && typeof field.defaultValue === "string" ? field.defaultValue : "",
    ]),
  );
}

export function getFallbackActions(request: LiveRequest): LiveRequestAction[] {
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

export function getActionClassName(action: LiveRequestAction): string {
  if (action.variant === "primary") {
    return "cc-button";
  }

  if (action.variant === "danger") {
    return "cc-button border-destructive/40 text-destructive hover:bg-destructive/10";
  }

  return "cc-button cc-button-secondary";
}

export function isActionDisabled(
  action: LiveRequestAction,
  values: Record<string, string>,
): boolean {
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
