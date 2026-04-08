import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ProviderOauthAuthorization,
  ProviderOauthCompleteResult,
  ProviderStatus,
} from "@cc/shared/schemas";

import { useProviderConnections } from "@/hooks/use-provider-connections";

type ProviderConnectionsPageProps = {
  active: boolean;
};

type DialogState = {
  provider: ProviderStatus;
  mode: "api" | "oauth";
};

export function ProviderConnectionsPage(props: ProviderConnectionsPageProps) {
  const {
    providers,
    loading,
    busyProviderId,
    error,
    refresh,
    connectApiKey,
    startOauth,
    completeOauth,
    disconnect,
  } = useProviderConnections();
  const [dialog, setDialog] = useState<DialogState>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const availableModels = providers.flatMap((entry) =>
    entry.models.map((model) => ({
      ...model,
      providerName: entry.provider.name,
      connected: entry.connected,
    })),
  );
  const connectedModels = availableModels.filter((model) => model.connected);

  if (!props.active) {
    return null;
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/30">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
          Provider Connections
        </p>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Connect models once, use them everywhere.
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              CommandsCenter delegates provider auth to OpenCode, then reads back connected
              providers and models so the next agent and chat flows can reuse them.
            </p>
          </div>
          <button
            className="cc-button cc-button-secondary"
            onClick={() => void refresh()}
            type="button"
          >
            Refresh
          </button>
        </div>
      </section>

      {error ? (
        <section className="cc-alert flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Provider data could not be loaded.</p>
            <p className="mt-1 text-sm text-rose-100/90">{error}</p>
          </div>
          <button
            className="cc-button cc-button-secondary"
            onClick={() => void refresh()}
            type="button"
          >
            Try again
          </button>
        </section>
      ) : null}

      {successMessage ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {successMessage}
        </section>
      ) : null}

      {!loading ? (
        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-xl shadow-slate-950/20">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Available models</h2>
              <p className="mt-1 text-sm text-slate-300">
                Connected providers expose these models right now. This is the quickest way to
                confirm auth worked.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              {connectedModels.length} connected model{connectedModels.length === 1 ? "" : "s"}
            </div>
          </div>

          {connectedModels.length > 0 ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {connectedModels.map((model) => (
                <div
                  className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4"
                  key={`${model.providerId}:${model.id}`}
                >
                  <p className="text-sm font-semibold text-white">{model.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-emerald-200">
                    {model.providerName}
                  </p>
                  <p className="mt-2 break-all text-xs text-slate-300">{model.id}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-slate-300">
              No connected provider models yet. Authenticate a provider below, then refresh to
              confirm the model list.
            </div>
          )}
        </section>
      ) : null}

      {loading ? <LoadingState /> : null}

      {!loading && providers.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-white/15 bg-slate-950/50 p-10 text-center text-slate-300">
          No providers are available from OpenCode right now.
        </section>
      ) : null}

      {!loading ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((entry) => {
            const oauthMethod = entry.authMethods.find(
              (method: ProviderStatus["authMethods"][number]) => method.type === "oauth",
            );
            const apiMethod = entry.authMethods.find(
              (method: ProviderStatus["authMethods"][number]) => method.type === "api",
            );
            const busy = busyProviderId === entry.provider.id;

            return (
              <article
                className="flex min-h-72 flex-col rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-lg shadow-slate-950/20"
                key={entry.provider.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-white">{entry.provider.name}</h2>
                    <p className="mt-1 text-sm text-slate-400">{entry.provider.id}</p>
                  </div>
                  <span
                    className={
                      entry.connected ? "cc-badge cc-badge-connected" : "cc-badge cc-badge-muted"
                    }
                  >
                    {entry.connected ? "Connected" : "Not connected"}
                  </span>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-white/5 p-3">
                    <dt className="text-slate-400">Models</dt>
                    <dd className="mt-1 text-lg font-semibold text-white">{entry.models.length}</dd>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-3">
                    <dt className="text-slate-400">Default</dt>
                    <dd className="mt-1 truncate text-sm font-medium text-white">
                      {entry.defaultModel ?? "None"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-wrap gap-2">
                  {entry.models.slice(0, 4).map((model: ProviderStatus["models"][number]) => (
                    <span
                      className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100"
                      key={model.id}
                    >
                      {model.name}
                    </span>
                  ))}
                  {entry.models.length > 4 ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
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
                        onClick={() => void disconnect(entry.provider.id)}
                        type="button"
                      >
                        Disconnect
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-400">
                    {entry.authMethods
                      .map((method: ProviderStatus["authMethods"][number]) => method.label)
                      .join(" • ") || "No auth methods exposed by OpenCode."}
                  </p>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {dialog ? (
        <ProviderDialog
          busy={busyProviderId === dialog.provider.provider.id}
          mode={dialog.mode}
          onClose={() => setDialog(undefined)}
          onCompleteOauth={completeOauth}
          onConnectApiKey={connectApiKey}
          onSuccess={(message) => {
            setSuccessMessage(message);
            setDialog(undefined);
          }}
          onStartOauth={startOauth}
          provider={dialog.provider}
        />
      ) : null}
    </main>
  );
}

function LoadingState() {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="providers-loading">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          className="min-h-72 animate-pulse rounded-3xl border border-white/10 bg-white/5"
          key={String(index)}
        />
      ))}
    </section>
  );
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
  onSuccess: (message: string) => void;
};

function ProviderDialog(props: ProviderDialogProps) {
  const apiKeyMethod = props.provider.authMethods.find(
    (method: ProviderStatus["authMethods"][number]) => method.type === "api",
  );
  const oauthMethod = props.provider.authMethods.find(
    (method: ProviderStatus["authMethods"][number]) => method.type === "oauth",
  );
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
  const pollRef = useRef<number | undefined>(undefined);
  const pollBusyRef = useRef(false);

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

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
      pollBusyRef.current = false;
    };
  }, []);

  async function handleApiKeySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(undefined);

    try {
      setDialogBusy(true);
      await props.onConnectApiKey(props.provider.provider.id, apiKey);
      props.onSuccess(`${props.provider.provider.name} connected.`);
    } catch (error) {
      setLocalError(readDialogError(error));
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
      const auth = await props.onStartOauth(
        props.provider.provider.id,
        props.provider.authMethods.indexOf(oauthMethod),
        Object.keys(inputs).length > 0 ? inputs : undefined,
      );

      setOauthSession({
        method: props.provider.authMethods.indexOf(oauthMethod),
        auth,
      });
      setAutoStatus(undefined);
      window.open(auth.url, "_blank", "noopener,noreferrer");

      if (auth.method === "auto") {
        startPolling(props.provider.provider.id, props.provider.authMethods.indexOf(oauthMethod));
      }
    } catch (error) {
      setLocalError(readDialogError(error));
    } finally {
      setDialogBusy(false);
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
          }

          props.onSuccess(result.message ?? `${props.provider.provider.name} connected.`);
        })
        .catch(() => undefined)
        .finally(() => {
          pollBusyRef.current = false;
          setDialogBusy(false);
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
      const result = await props.onCompleteOauth(
        props.provider.provider.id,
        oauthSession.method,
        manualCode || undefined,
      );

      if (result.connected) {
        props.onSuccess(result.message ?? `${props.provider.provider.name} connected.`);
        return;
      }

      if (result.pending) {
        setAutoStatus("Waiting for provider confirmation...");
        startPolling(props.provider.provider.id, oauthSession.method);
        return;
      }
    } catch (error) {
      setLocalError(readDialogError(error));
    } finally {
      setDialogBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-3 sm:items-center sm:p-6">
      <section className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-slate-950/60">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
              {props.provider.provider.name}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
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
            <label className="block text-sm font-medium text-slate-200" htmlFor="api-key-input">
              API key
            </label>
            <input
              className="cc-input"
              id="api-key-input"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-..."
              type="password"
              value={apiKey}
            />
            <p className="text-sm text-slate-400">
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
                {prompts.map((prompt: (typeof prompts)[number]) => {
                  if (prompt.type === "text") {
                    return (
                      <label className="grid gap-2 text-sm text-slate-200" key={prompt.key}>
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
                    <label className="grid gap-2 text-sm text-slate-200" key={prompt.key}>
                      <span>{prompt.message}</span>
                      <select
                        className="cc-input"
                        onChange={(event) =>
                          setInputs((current) => ({
                            ...current,
                            [prompt.key]: event.target.value,
                          }))
                        }
                        value={inputs[prompt.key] ?? prompt.options[0]?.value ?? ""}
                      >
                        {prompt.options.map((option: (typeof prompt.options)[number]) => (
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
              {props.busy || dialogBusy ? "Starting..." : "Open provider login"}
            </button>

            {oauthSession ? (
              <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm text-slate-200">
                <p className="font-medium text-white">OAuth session started</p>
                <p className="mt-2 whitespace-pre-wrap text-slate-300">
                  {oauthSession.auth.instructions ||
                    "Complete the provider login in the opened browser window."}
                </p>
                <p className="mt-3 text-xs uppercase tracking-[0.2em] text-cyan-200">
                  Mode: {oauthSession.auth.method}
                </p>
                {autoStatus ? <p className="mt-3 text-sm text-cyan-100">{autoStatus}</p> : null}
              </div>
            ) : null}

            {oauthSession ? (
              <form className="space-y-4" onSubmit={(event) => void handleManualOauthSubmit(event)}>
                <label className="grid gap-2 text-sm text-slate-200" htmlFor="oauth-code-input">
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

function readDialogError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Provider authentication failed.";
}
