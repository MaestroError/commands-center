import { useEffect, useMemo, useRef, useState } from "react";

import { ChevronDown } from "lucide-react";

import type {
  ProviderOauthAuthorization,
  ProviderOauthCompleteResult,
  ProviderStatus,
} from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { PasswordInput } from "@/components/common/PasswordInput";
import { useProviderMutations, useProvidersQuery } from "@/hooks/use-providers-query";

type DialogState = {
  provider: ProviderStatus;
  mode: "api" | "oauth";
};

export function ProviderConnectionsPage() {
  const providersQuery = useProvidersQuery();
  const providerMutations = useProviderMutations();
  const [dialog, setDialog] = useState<DialogState>();
  const [busyProviderId, setBusyProviderId] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [search, setSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [modelsExpanded, setModelsExpanded] = useState(false);
  const providers = providersQuery.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const filteredProviders = normalizedSearch
    ? providers.filter(
        (entry: ProviderStatus) =>
          entry.provider.name.toLowerCase().includes(normalizedSearch) ||
          entry.provider.id.toLowerCase().includes(normalizedSearch),
      )
    : providers;
  const availableModels = providers.flatMap((entry: ProviderStatus) =>
    entry.models.map((model: ProviderStatus["models"][number]) => ({
      ...model,
      providerName: entry.provider.name,
      connected: entry.connected,
    })),
  );
  const connectedModels = availableModels.filter(
    (model: (typeof availableModels)[number]) => model.connected,
  );
  const normalizedModelSearch = modelSearch.trim().toLowerCase();
  const filteredModels = normalizedModelSearch
    ? connectedModels.filter(
        (model: (typeof connectedModels)[number]) =>
          model.name.toLowerCase().includes(normalizedModelSearch) ||
          model.id.toLowerCase().includes(normalizedModelSearch) ||
          model.providerName.toLowerCase().includes(normalizedModelSearch),
      )
    : connectedModels;
  const queryError = providersQuery.error ? readError(providersQuery.error) : undefined;

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          <button
            className="cc-button cc-button-secondary"
            onClick={() => void providersQuery.refetch()}
            type="button"
          >
            Refresh
          </button>
        }
        description="CommandsCenter delegates provider authentication to OpenCode, then surfaces the connected providers and models inside the shared application shell."
        eyebrow="Provider Connections"
        title="Connect models once, use them everywhere."
      />

      {queryError ? (
        <ErrorState
          action={
            <button
              className="cc-button cc-button-secondary"
              onClick={() => void providersQuery.refetch()}
              type="button"
            >
              Try again
            </button>
          }
          description={queryError}
          title="Provider data could not be loaded."
        />
      ) : null}

      {successMessage ? <section className="cc-success">{successMessage}</section> : null}

      {providersQuery.isLoading ? <LoadingState testId="providers-loading" /> : null}

      {!providersQuery.isLoading ? (
        <section className="cc-panel p-6">
          <button
            aria-expanded={modelsExpanded}
            aria-label={`${modelsExpanded ? "Collapse" : "Expand"} available models`}
            className="flex w-full flex-col gap-3 text-left md:flex-row md:items-start md:justify-between"
            onClick={() => setModelsExpanded((current) => !current)}
            type="button"
          >
            <div>
              <h2 className="text-xl font-semibold text-text-primary">Available models</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Connected providers expose these models right now, which makes auth verification
                immediate.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
                {connectedModels.length} connected model{connectedModels.length === 1 ? "" : "s"}
              </span>
              <ChevronDown
                aria-hidden
                className={`h-5 w-5 shrink-0 text-text-secondary transition-transform ${
                  modelsExpanded ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>

          {modelsExpanded ? (
            <div className="mt-5 grid gap-4">
              {connectedModels.length > 0 ? (
                <input
                  aria-label="Search models"
                  className="cc-input w-full md:w-auto md:min-w-80"
                  onChange={(event) => setModelSearch(event.target.value)}
                  placeholder="Search models"
                  value={modelSearch}
                />
              ) : null}

              {connectedModels.length === 0 ? (
                <EmptyState
                  description="Authenticate a provider below, then refresh to confirm the model list."
                  title="No connected provider models yet."
                />
              ) : filteredModels.length === 0 ? (
                <EmptyState
                  description="No connected models match the current search."
                  title="No matching models"
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filteredModels.map((model: (typeof filteredModels)[number]) => (
                    <div
                      className="rounded-lg border border-border bg-surface p-4"
                      key={`${model.providerId}:${model.id}`}
                    >
                      <p className="text-sm font-semibold text-text-primary">{model.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-accent">
                        {model.providerName}
                      </p>
                      <p className="mt-2 break-all text-xs text-text-secondary">{model.id}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {!providersQuery.isLoading && providers.length === 0 ? (
        <EmptyState
          description="No providers are available from OpenCode right now."
          title="Nothing to connect yet."
        />
      ) : null}

      {!providersQuery.isLoading && providers.length > 0 ? (
        <div className="grid gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">Providers</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Connect or manage authentication for each available provider.
              </p>
            </div>
            <input
              aria-label="Search providers"
              className="cc-input w-full md:w-auto md:min-w-80"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search providers"
              value={search}
            />
          </div>

          {filteredProviders.length === 0 ? (
            <EmptyState
              description="No providers match the current search."
              title="No matching providers"
            />
          ) : (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredProviders.map((entry: ProviderStatus) => {
                const oauthMethod = entry.authMethods.find(
                  (method: ProviderStatus["authMethods"][number]) => method.type === "oauth",
                );
                const apiMethod = entry.authMethods.find(
                  (method: ProviderStatus["authMethods"][number]) => method.type === "api",
                );
                const busy = busyProviderId === entry.provider.id;

                return (
                  <article className="cc-panel flex min-h-72 flex-col p-5" key={entry.provider.id}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-semibold text-text-primary">
                          {entry.provider.name}
                        </h2>
                        <p className="mt-1 text-sm text-text-secondary">{entry.provider.id}</p>
                      </div>
                      <span
                        className={
                          entry.connected
                            ? "cc-badge cc-badge-connected"
                            : "cc-badge cc-badge-muted"
                        }
                      >
                        {entry.connected ? "Connected" : "Not connected"}
                      </span>
                    </div>

                    <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg border border-border bg-surface p-3">
                        <dt className="text-text-secondary">Models</dt>
                        <dd className="mt-1 text-lg font-semibold text-text-primary">
                          {entry.models.length}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-border bg-surface p-3">
                        <dt className="text-text-secondary">Default</dt>
                        <dd className="mt-1 truncate text-sm font-medium text-text-primary">
                          {entry.defaultModel ?? "None"}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {entry.models.slice(0, 4).map((model: ProviderStatus["models"][number]) => (
                        <span
                          className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs text-accent"
                          key={model.id}
                        >
                          {model.name}
                        </span>
                      ))}
                      {entry.models.length > 4 ? (
                        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
                          +{String(entry.models.length - 4)} more
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-auto pt-6">
                      <div className="flex flex-wrap gap-2">
                        {apiMethod ? (
                          <button
                            className="cc-button"
                            disabled={busy}
                            onClick={() => setDialog({ provider: entry, mode: "api" })}
                            type="button"
                          >
                            {entry.connected ? "Update API key" : "Connect API key"}
                          </button>
                        ) : null}
                        {oauthMethod ? (
                          <button
                            className="cc-button cc-button-secondary"
                            disabled={busy}
                            onClick={() => setDialog({ provider: entry, mode: "oauth" })}
                            type="button"
                          >
                            {entry.connected ? "Reconnect OAuth" : "Connect OAuth"}
                          </button>
                        ) : null}
                        {entry.connected ? (
                          <button
                            className="cc-button cc-button-danger"
                            disabled={busy}
                            onClick={() =>
                              void runProviderAction(
                                entry.provider.id,
                                setBusyProviderId,
                                async () => {
                                  setSuccessMessage(undefined);
                                  await providerMutations.disconnect.mutateAsync({
                                    providerId: entry.provider.id,
                                  });
                                },
                              )
                            }
                            type="button"
                          >
                            Disconnect
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-3 text-xs leading-5 text-text-secondary">
                        {entry.authMethods
                          .map((method: ProviderStatus["authMethods"][number]) => method.label)
                          .join(" • ") || "No auth methods exposed by OpenCode."}
                      </p>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </div>
      ) : null}

      {dialog ? (
        <ProviderDialog
          busy={busyProviderId === dialog.provider.provider.id}
          mode={dialog.mode}
          onClose={() => setDialog(undefined)}
          onCompleteOauth={async (providerId, method, code) =>
            runProviderAction(providerId, setBusyProviderId, () =>
              providerMutations.completeOauth.mutateAsync({ providerId, method, code }),
            )
          }
          onConnectApiKey={async (providerId, apiKey) =>
            runProviderAction(providerId, setBusyProviderId, async () => {
              await providerMutations.connectApiKey.mutateAsync({ providerId, apiKey });
              return true;
            })
          }
          onConnected={setSuccessMessage}
          onStartOauth={(providerId, method, inputs) =>
            providerMutations.startOauth.mutateAsync({ providerId, method, inputs })
          }
          provider={dialog.provider}
        />
      ) : null}
    </div>
  );
}

async function runProviderAction<T>(
  providerId: string,
  setBusyProviderId: (providerId?: string) => void,
  action: () => Promise<T>,
): Promise<T> {
  setBusyProviderId(providerId);

  try {
    return await action();
  } finally {
    setBusyProviderId(undefined);
  }
}

type ProviderDialogProps = {
  provider: ProviderStatus;
  mode: "api" | "oauth";
  busy: boolean;
  onClose: () => void;
  onConnectApiKey: (providerId: string, apiKey: string) => Promise<boolean>;
  onStartOauth: (
    providerId: string,
    method: number,
    inputs?: Record<string, string>,
  ) => Promise<ProviderOauthAuthorization>;
  onCompleteOauth: (
    providerId: string,
    method: number,
    code?: string,
  ) => Promise<ProviderOauthCompleteResult>;
  onConnected: (message: string) => void;
};

function ProviderDialog(props: ProviderDialogProps) {
  const apiKeyMethod = props.provider.authMethods.find((method) => method.type === "api");
  const oauthMethod = props.provider.authMethods.find((method) => method.type === "oauth");
  const [apiKey, setApiKey] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [oauthSession, setOauthSession] = useState<{
    method: number;
    auth: ProviderOauthAuthorization;
  }>();
  const [manualCode, setManualCode] = useState("");
  const [localError, setLocalError] = useState<string>();
  const [autoStatus, setAutoStatus] = useState<string>();
  const [dialogBusy, setDialogBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>();
  const pollRef = useRef<number | undefined>(undefined);
  const pollBusyRef = useRef(false);
  const completingRef = useRef(false);

  const prompts = useMemo(() => {
    if (!oauthMethod?.prompts) {
      return [];
    }

    return oauthMethod.prompts.filter((prompt: NonNullable<typeof oauthMethod.prompts>[number]) => {
      if (!prompt.when) {
        return true;
      }

      const value = inputs[prompt.when.key] ?? "";
      return prompt.when.op === "eq" ? value === prompt.when.value : value !== prompt.when.value;
    });
  }, [inputs, oauthMethod]);

  useEffect(
    () => () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
      pollBusyRef.current = false;
      completingRef.current = false;
    },
    [],
  );

  async function handleApiKeySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(undefined);

    try {
      setDialogBusy(true);
      await props.onConnectApiKey(props.provider.provider.id, apiKey);
      setSuccessMessage("Provider connected successfully");
      props.onConnected(`${props.provider.provider.name} connected.`);
    } catch (error) {
      setLocalError(readError(error));
    } finally {
      setDialogBusy(false);
    }
  }

  async function handleStartOauth() {
    if (!oauthMethod) {
      return;
    }

    setLocalError(undefined);

    try {
      setDialogBusy(true);
      const methodIndex = props.provider.authMethods.indexOf(oauthMethod);
      const auth = await props.onStartOauth(
        props.provider.provider.id,
        methodIndex,
        Object.keys(inputs).length > 0 ? inputs : undefined,
      );
      setOauthSession({ method: methodIndex, auth });
      setSuccessMessage(undefined);
      setAutoStatus(undefined);
      window.open(auth.url, "_blank", "noopener,noreferrer");

      if (auth.method === "auto") {
        completingRef.current = true;
        setAutoStatus("Waiting for provider confirmation...");
        startPolling(props.provider.provider.id, methodIndex);
        return;
      }
    } catch (error) {
      setLocalError(readError(error));
    } finally {
      if (!completingRef.current) {
        setDialogBusy(false);
      }
    }
  }

  function startPolling(providerId: string, method: number) {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
    }

    pollRef.current = window.setInterval(() => {
      if (pollBusyRef.current) {
        return;
      }

      pollBusyRef.current = true;
      setDialogBusy(true);
      void props
        .onCompleteOauth(providerId, method)
        .then((result) => {
          if (!result.connected) {
            setAutoStatus(result.pending ? "Waiting for provider confirmation..." : undefined);
            return;
          }

          if (pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = undefined;
          }

          completingRef.current = false;
          setDialogBusy(false);
          setSuccessMessage("Provider connected successfully");
          props.onConnected(result.message ?? `${props.provider.provider.name} connected.`);
        })
        .catch((error) => {
          setLocalError(readError(error));
        })
        .finally(() => {
          pollBusyRef.current = false;
        });
    }, 2000);
  }

  async function handleManualOauthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!oauthSession) {
      return;
    }

    setLocalError(undefined);

    try {
      setDialogBusy(true);
      completingRef.current = true;
      const result = await props.onCompleteOauth(
        props.provider.provider.id,
        oauthSession.method,
        manualCode || undefined,
      );

      if (result.connected) {
        completingRef.current = false;
        setDialogBusy(false);
        setSuccessMessage("Provider connected successfully");
        props.onConnected(result.message ?? `${props.provider.provider.name} connected.`);
        return;
      }

      if (result.pending) {
        setAutoStatus("Waiting for provider confirmation...");
        startPolling(props.provider.provider.id, oauthSession.method);
        return;
      }

      completingRef.current = false;
    } catch (error) {
      completingRef.current = false;
      setLocalError(readError(error));
    } finally {
      if (!completingRef.current) {
        setDialogBusy(false);
      }
    }
  }

  if (successMessage) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-app-bg/75 p-3 sm:items-center sm:p-6"
        onClick={props.onClose}
      >
        <section
          className="cc-panel w-full max-w-2xl p-6 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex justify-end">
            <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
              Close
            </button>
          </div>
          <div className="flex min-h-80 flex-col items-center justify-center gap-5 text-center">
            <div aria-label="success" className="text-6xl" role="img">
              OK
            </div>
            <div>
              <p className="cc-eyebrow">{props.provider.provider.name}</p>
              <h2 className="mt-3 text-3xl font-semibold text-text-primary">
                Provider connected successfully
              </h2>
              <p className="mt-3 text-sm text-text-secondary">
                The provider is now available in CommandsCenter.
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-app-bg/75 p-3 sm:items-center sm:p-6"
      onClick={props.onClose}
    >
      <section
        className="cc-panel w-full max-w-2xl p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="cc-eyebrow">{props.provider.provider.name}</p>
            <h2 className="mt-2 text-2xl font-semibold text-text-primary">
              {props.mode === "api" ? "Connect with API key" : "Connect with OAuth"}
            </h2>
          </div>
          <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
            Close
          </button>
        </div>

        {localError ? <div className="cc-alert mt-5">{localError}</div> : null}

        {props.mode === "api" && apiKeyMethod ? (
          <form className="mt-6 space-y-4" onSubmit={(event) => void handleApiKeySubmit(event)}>
            <label className="block text-sm font-medium text-text-primary" htmlFor="api-key-input">
              API key
            </label>
            <PasswordInput
              id="api-key-input"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-..."
              value={apiKey}
            />
            <p className="text-sm text-text-secondary">
              OpenCode stores and validates the key with the selected provider.
            </p>
            <button
              className="cc-button"
              disabled={props.busy || dialogBusy || apiKey.trim().length === 0}
              type="submit"
            >
              {props.busy || dialogBusy ? "Saving..." : "Save key"}
            </button>
          </form>
        ) : null}

        {props.mode === "oauth" && oauthMethod ? (
          <div className="mt-6 space-y-5">
            {prompts.length > 0 ? (
              <div className="grid gap-4">
                {prompts.map((prompt) => {
                  if (prompt.type === "text") {
                    return (
                      <label className="grid gap-2 text-sm text-text-primary" key={prompt.key}>
                        <span>{prompt.message}</span>
                        <input
                          className="cc-input"
                          onChange={(event) =>
                            setInputs((current) => ({
                              ...current,
                              [prompt.key]: event.target.value,
                            }))
                          }
                          placeholder={prompt.placeholder}
                          value={inputs[prompt.key] ?? ""}
                        />
                      </label>
                    );
                  }

                  return (
                    <label className="grid gap-2 text-sm text-text-primary" key={prompt.key}>
                      <span>{prompt.message}</span>
                      <select
                        className="cc-input"
                        onChange={(event) =>
                          setInputs((current) => ({ ...current, [prompt.key]: event.target.value }))
                        }
                        value={inputs[prompt.key] ?? prompt.options[0]?.value ?? ""}
                      >
                        {prompt.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            ) : null}

            <button
              className="cc-button"
              disabled={props.busy || dialogBusy}
              onClick={() => void handleStartOauth()}
              type="button"
            >
              {props.busy || dialogBusy ? "Completing..." : "Open provider login"}
            </button>

            {oauthSession ? (
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm text-text-primary">
                <p className="font-medium text-text-primary">OAuth session started</p>
                <p className="mt-2 whitespace-pre-wrap text-text-secondary">
                  {oauthSession.auth.instructions ||
                    "Complete the provider login in the opened browser window."}
                </p>
                <p className="mt-3 text-xs uppercase tracking-[0.2em] text-accent">
                  Mode: {oauthSession.auth.method}
                </p>
                {autoStatus ? <p className="mt-3 text-sm text-accent">{autoStatus}</p> : null}
              </div>
            ) : null}

            {oauthSession ? (
              <form className="space-y-4" onSubmit={(event) => void handleManualOauthSubmit(event)}>
                <label className="grid gap-2 text-sm text-text-primary" htmlFor="oauth-code-input">
                  <span>Manual code or callback value</span>
                  <input
                    className="cc-input"
                    id="oauth-code-input"
                    onChange={(event) => setManualCode(event.target.value)}
                    placeholder="Paste code only if the provider flow asks for it"
                    value={manualCode}
                  />
                </label>
                <button
                  className="cc-button cc-button-secondary"
                  disabled={props.busy || dialogBusy}
                  type="submit"
                >
                  {props.busy || dialogBusy ? "Completing..." : "Complete OAuth"}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function readError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Provider authentication failed.";
}
