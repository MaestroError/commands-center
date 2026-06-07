import { useEffect, useState } from "react";

import type { LiveRequest, LiveRequestAction, LiveRequestFormField } from "@cc/shared/schemas";

import { AgentAvatarPicker } from "@/components/agents/AgentAvatarPicker";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import { useAgentCatalogQuery, useAgentsQuery } from "@/hooks/use-agents-query";

import {
  getActionClassName,
  getFallbackActions,
  getInitialValues,
  isActionDisabled,
} from "./live-request-helpers";

type Props = {
  request: LiveRequest;
  onResolve?: (requestId: string, action: string, values: Record<string, string>) => Promise<void>;
  onCancel?: (requestId: string, reason?: string) => Promise<void>;
};

const MODEL_FIELD_NAMES = new Set(["defaultModel"]);
const AGENT_FIELD_NAMES = new Set(["agentId", "defaultAgentId"]);
const DATETIME_FIELD_NAMES = new Set(["scheduledAt", "dueAt"]);
const JSON_FIELD_NAMES = new Set(["metadataJson", "recurrenceJson", "capabilitiesJson"]);

type ReviewIdentity = { name: string; iconPath?: string };

/**
 * Compact, single-column review form for agent/task draft live-requests. It renders the
 * fields the backend sends (upgrading known field names to richer inputs) plus an identity
 * header for updates, with a sticky Cancel/Apply footer. Capabilities are edited as JSON.
 */
export function LiveRequestReviewForm(props: Props) {
  const { request } = props;
  const [values, setValues] = useState<Record<string, string>>(() => getInitialValues(request));
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const identity = reviewIdentity(request);
  const actions = request.actions.length > 0 ? request.actions : getFallbackActions(request);

  const needsAgents = request.fields.some((field) => AGENT_FIELD_NAMES.has(field.name));
  const needsModels = request.fields.some((field) => MODEL_FIELD_NAMES.has(field.name));
  const agentsQuery = useAgentsQuery();
  const catalogQuery = useAgentCatalogQuery();
  const agents = needsAgents ? (agentsQuery.data ?? []) : [];
  const providerModels = needsModels ? (catalogQuery.data?.providerModels ?? []) : [];

  useEffect(() => {
    setValues(getInitialValues(request));
    setBusy(false);
    setErrorMessage(undefined);
  }, [request]);

  function setValue(name: string, value: string): void {
    setValues((current) => ({ ...current, [name]: value }));
    setErrorMessage(undefined);
  }

  async function handleAction(action: LiveRequestAction): Promise<void> {
    if (busy) {
      return;
    }

    if (action.kind === "cancel") {
      if (!props.onCancel) {
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

    const invalidJson = request.fields.find(
      (field) => JSON_FIELD_NAMES.has(field.name) && !isValidJsonObject(values[field.name]),
    );
    if (invalidJson) {
      setErrorMessage(`${invalidJson.label} must be a valid JSON object.`);
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

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Agent waiting
            </p>
            <h2 className="mt-2 text-lg font-semibold text-text-primary">
              {request.presentation.title}
            </h2>
            {request.presentation.description ? (
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                {request.presentation.description}
              </p>
            ) : null}
          </div>

          {identity ? <IdentityHeader identity={identity} /> : null}

          <div className="flex flex-col gap-4">
            {request.fields.map((field) => (
              <div className="min-w-0" key={field.name}>
                <span className="text-sm font-medium text-text-primary">{field.label}</span>
                {field.description ? (
                  <span className="mt-1 block text-xs text-text-secondary">
                    {field.description}
                  </span>
                ) : null}
                <div className="mt-2">
                  {renderField({
                    field,
                    value: values[field.name] ?? "",
                    busy,
                    agents,
                    providerModels,
                    avatarName: values["name"] ?? identity?.name ?? "",
                    onChange: (next) => setValue(field.name, next),
                  })}
                </div>
              </div>
            ))}
          </div>

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-surface p-4">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-2">
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

function IdentityHeader(props: { identity: ReviewIdentity }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <AgentAvatar iconPath={props.identity.iconPath ?? ""} name={props.identity.name} size="md" />
      <span className="min-w-0 truncate text-sm font-semibold text-text-primary">
        {props.identity.name}
      </span>
    </div>
  );
}

function reviewIdentity(request: LiveRequest): ReviewIdentity | undefined {
  const metadata = request.metadata ?? {};
  const name =
    typeof metadata["agentName"] === "string"
      ? metadata["agentName"]
      : typeof metadata["taskTitle"] === "string"
        ? metadata["taskTitle"]
        : undefined;

  if (!name) {
    return undefined;
  }

  const iconPath =
    typeof metadata["agentIconPath"] === "string" ? metadata["agentIconPath"] : undefined;
  return { name, iconPath };
}

function renderField(args: {
  field: LiveRequestFormField;
  value: string;
  busy: boolean;
  agents: Array<{ id: string; name: string }>;
  providerModels: Array<{ id: string; label: string }>;
  avatarName: string;
  onChange: (value: string) => void;
}) {
  const { field, value, busy, agents, providerModels, avatarName, onChange } = args;
  const inputClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-accent";

  if (field.name === "iconPath") {
    return <AgentAvatarPicker dense name={avatarName} onChange={onChange} value={value} />;
  }

  if (MODEL_FIELD_NAMES.has(field.name)) {
    const modelOptions =
      value && !providerModels.some((model) => model.id === value)
        ? [{ id: value, label: value }, ...providerModels]
        : providerModels;
    return (
      <SearchableSelect
        ariaLabel={field.label}
        className={inputClass}
        disabled={busy}
        onChange={onChange}
        options={modelOptions}
        placeholder="Search models..."
        value={value}
      />
    );
  }

  if (AGENT_FIELD_NAMES.has(field.name)) {
    return (
      <select
        className={inputClass}
        disabled={busy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {!field.required ? <option value="">No agent</option> : null}
        {value && !agents.some((agent) => agent.id === value) ? (
          <option value={value}>{value}</option>
        ) : null}
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
    );
  }

  if (DATETIME_FIELD_NAMES.has(field.name)) {
    return (
      <input
        className={inputClass}
        disabled={busy}
        type="datetime-local"
        value={isoToLocalInput(value)}
        onChange={(event) => onChange(localInputToIso(event.target.value))}
      />
    );
  }

  if (JSON_FIELD_NAMES.has(field.name) || field.type === "textarea") {
    const mono = JSON_FIELD_NAMES.has(field.name) ? " font-mono" : "";
    return (
      <textarea
        className={`${inputClass} min-h-28 resize-y${mono}`}
        disabled={busy}
        placeholder={field.placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <input
      className={inputClass}
      disabled={busy}
      placeholder={field.placeholder}
      type={field.type === "password" ? "password" : "text"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function isValidJsonObject(value: string | undefined): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return true;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function isoToLocalInput(iso: string): string {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (input: number) => String(input).padStart(2, "0");
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(local: string): string {
  if (!local) {
    return "";
  }

  const date = new Date(local);
  if (Number.isNaN(date.getTime())) {
    return local;
  }

  return date.toISOString();
}
