// Split out of IntegrationsPage.tsx (issue #99).

import { PasswordInput } from "@/components/common/PasswordInput";
import type { McpServer } from "@cc/shared/schemas";
import { useEffect, useRef, useState } from "react";
import {
  CC_INSTANCE_MCP_PATH,
  COMPOSIO_API_KEY_HEADER,
  type CcInstanceFormErrors,
  type CcInstanceFormState,
  DEFAULT_COMPOSIO_NAME,
  readError,
  resolveCcInstanceMcpUrl,
  suggestSecretKey,
  suggestUniqueName,
  toMcpServerName,
  validateCcInstanceForm,
  validateSecretKeyName,
} from "./integration-helpers";
import { CloseIcon } from "./integration-icons";
import { DerivedNameNote } from "./integration-parts";
import { Field } from "./mcp-server-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ComposioDialog(props: {
  busy: boolean;
  existingNames: string[];
  existingSecretKeys: string[];
  onClose: () => void;
  onSubmit: (input: { name: string; secretKey: string; apiKey: string }) => Promise<void>;
}) {
  const initialName = props.existingNames.some(
    (existing) => existing.toLowerCase() === DEFAULT_COMPOSIO_NAME,
  )
    ? suggestUniqueName(DEFAULT_COMPOSIO_NAME, props.existingNames)
    : DEFAULT_COMPOSIO_NAME;
  const [name, setName] = useState(initialName);
  const [secretKey, setSecretKey] = useState(() =>
    suggestSecretKey("CC_COMPOSIO", initialName, "API_KEY"),
  );
  const [secretKeyEdited, setSecretKeyEdited] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [submitError, setSubmitError] = useState<string>();
  const secretKeyExists = props.existingSecretKeys.includes(secretKey.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/60 p-4 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        className="cc-panel flex min-h-0 max-h-[calc(100vh-8rem)] w-full max-w-xl flex-col overflow-hidden p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Connect Composio</h2>
            <p className="mt-1 text-sm text-text-secondary">
              CC manages the endpoint and transport. Save your Composio API key now, then activate
              the integration when you are ready to restart the AI engine.
            </p>
          </div>
          <button
            className="rounded-md p-2 text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
            onClick={props.onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <Field label="Name" required>
            <Input
              aria-label="Composio name"
              onChange={(event) => {
                setName(event.target.value);
                setSubmitError(undefined);

                if (!secretKeyEdited) {
                  setSecretKey(suggestSecretKey("CC_COMPOSIO", event.target.value, "API_KEY"));
                }
              }}
              value={name}
            />
            <DerivedNameNote label={name} />
          </Field>

          <Field label="Secret name" required>
            <Input
              aria-label="Composio secret name"
              onChange={(event) => {
                setSecretKeyEdited(true);
                setSecretKey(event.target.value);
                setSubmitError(undefined);
              }}
              value={secretKey}
            />
            {secretKeyExists ? (
              <p className="mt-2 text-xs text-warning-foreground">
                This secret already exists and its value will be replaced.
              </p>
            ) : null}
          </Field>

          <Field label="API key" required>
            <PasswordInput
              aria-label="Composio API key"
              onChange={(event) => {
                setApiKey(event.target.value);
                setSubmitError(undefined);
              }}
              value={apiKey}
            />
            <p className="mt-2 text-xs text-text-secondary">
              Get this from Composio For You → Settings → Sessions &amp; API Keys. CC sends it
              through the predefined <code>{COMPOSIO_API_KEY_HEADER}</code> header.
            </p>
          </Field>

          {submitError ? <p className="text-sm text-danger">{submitError}</p> : null}

          <div className="mt-2 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button variant="secondary" onClick={props.onClose} type="button">
              Cancel
            </Button>
            <Button disabled={props.busy} type="submit">
              {props.busy ? "Saving..." : "Save Composio"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(undefined);

    const serverName = toMcpServerName(name);
    if (!serverName) {
      setSubmitError("Name must contain at least one letter or digit.");
      return;
    }

    if (props.existingNames.some((existing) => existing.toLowerCase() === serverName)) {
      setSubmitError(`An MCP server named '${serverName}' already exists.`);
      return;
    }

    const secretKeyError = validateSecretKeyName(secretKey);
    if (secretKeyError) {
      setSubmitError(secretKeyError);
      return;
    }

    if (!apiKey.trim()) {
      setSubmitError("API key is required.");
      return;
    }

    try {
      await props.onSubmit({
        name: serverName,
        secretKey: secretKey.trim(),
        apiKey: apiKey.trim(),
      });
    } catch (error) {
      setSubmitError(readError(error));
    }
  }
}

export function CcInstanceDialog(props: {
  busy: boolean;
  existingNames: string[];
  existingSecretKeys: string[];
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    url: string;
    secretKey: string;
    secretValue: string;
  }) => Promise<void>;
}) {
  const [form, setForm] = useState<CcInstanceFormState>({
    name: "",
    url: "",
    secretKey: "",
    secretValue: "",
  });
  const [secretKeyEdited, setSecretKeyEdited] = useState(false);
  const [errors, setErrors] = useState<CcInstanceFormErrors>({});
  const [submitError, setSubmitError] = useState<string>();
  const resolvedUrl = resolveCcInstanceMcpUrl(form.url);
  const secretKeyExists = props.existingSecretKeys.includes(form.secretKey.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/60 p-4 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        className="cc-panel flex min-h-0 max-h-[calc(100vh-8rem)] w-full max-w-xl flex-col overflow-hidden p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Connect CC instance</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Use another CommandsCenter instance as an MCP server. CC appends{" "}
              <code>{CC_INSTANCE_MCP_PATH}</code> and sends the API token as a bearer header.
            </p>
          </div>
          <button
            className="rounded-md p-2 text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
            onClick={props.onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>

        <form
          className="mt-6 grid min-h-0 flex-1 gap-4 overflow-y-auto"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <Field error={errors.name} label="Name" required>
            <Input
              aria-label="CC instance name"
              onChange={(event) => updateForm({ name: event.target.value })}
              placeholder="staging-cc"
              value={form.name}
            />
            <DerivedNameNote label={form.name} />
          </Field>

          <Field error={errors.url} label="Instance URL" required>
            <Input
              aria-label="CC instance URL"
              onChange={(event) => updateForm({ url: event.target.value })}
              placeholder="cc.example.com"
              value={form.url}
            />
            {resolvedUrl ? (
              <p className="mt-2 break-all text-xs text-text-secondary">
                Endpoint: <code>{resolvedUrl}</code>
              </p>
            ) : null}
          </Field>

          <Field error={errors.secretKey} label="Secret name" required>
            <Input
              aria-label="CC instance secret name"
              onChange={(event) => {
                setSecretKeyEdited(true);
                updateForm({ secretKey: event.target.value });
              }}
              placeholder="CC_INSTANCE_STAGING_CC_TOKEN"
              value={form.secretKey}
            />
            {secretKeyExists ? (
              <p className="mt-2 text-xs text-warning-foreground">
                This secret already exists and its value will be replaced.
              </p>
            ) : null}
          </Field>

          <Field error={errors.secretValue} label="API token" required>
            <PasswordInput
              aria-label="CC instance API token"
              onChange={(event) => updateForm({ secretValue: event.target.value })}
              value={form.secretValue}
            />
            <p className="mt-2 text-xs text-text-secondary">
              Create this on the other instance under API → Tokens, granting only the capabilities
              it should expose. CC stores it encrypted under the secret name above.
            </p>
          </Field>

          {submitError ? <p className="text-sm text-danger">{submitError}</p> : null}

          <div className="mt-2 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button variant="secondary" onClick={props.onClose} type="button">
              Cancel
            </Button>
            <Button disabled={props.busy} type="submit">
              {props.busy ? "Saving..." : "Save instance"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  function updateForm(patch: Partial<CcInstanceFormState>): void {
    setSubmitError(undefined);
    setForm((current) => {
      const next = { ...current, ...patch };

      if (patch.name !== undefined && !secretKeyEdited) {
        next.secretKey = suggestSecretKey("CC_INSTANCE", patch.name, "TOKEN");
      }

      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitError(undefined);

    const nextErrors = validateCcInstanceForm(form, props.existingNames);
    setErrors(nextErrors);

    const endpoint = resolveCcInstanceMcpUrl(form.url);
    if (Object.values(nextErrors).some(Boolean) || !endpoint) {
      return;
    }

    try {
      await props.onSubmit({
        name: toMcpServerName(form.name),
        url: endpoint,
        secretKey: form.secretKey.trim(),
        secretValue: form.secretValue.trim(),
      });
    } catch (error) {
      setSubmitError(readError(error));
    }
  }
}

export function McpAuthDialog(props: {
  server: McpServer;
  composio: boolean;
  browserBusy: boolean;
  startBusy: boolean;
  onClose: () => void;
  onAuthenticate: () => Promise<void>;
  onStartHosted: () => Promise<string>;
  onRefresh: () => Promise<McpServer | undefined>;
  onConnected: (name: string) => void;
}) {
  const [error, setError] = useState<string>();
  const [awaiting, setAwaiting] = useState(false);
  const [authUrl, setAuthUrl] = useState<string>();
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  const busy = props.browserBusy || props.startBusy || awaiting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/60 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : props.onClose}
    >
      <div
        className="cc-panel flex min-h-0 max-h-[calc(100vh-8rem)] w-full max-w-xl flex-col overflow-hidden p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Authenticate {props.server.name}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {props.composio
                ? "We’ll open your default browser to complete sign-in. This window will update automatically when authentication succeeds."
                : "We’ll open the provider’s sign-in page in a new tab. After you approve, this dialog updates automatically — the browser is redirected back to CC."}
            </p>
          </div>
          <button
            className="rounded-md p-2 text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
            onClick={props.onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-6 grid min-h-0 flex-1 gap-4 overflow-y-auto">
          {props.composio ? (
            <Button
              disabled={props.browserBusy}
              onClick={() => void handleAuthenticateBrowser()}
              type="button"
            >
              {props.browserBusy ? "Waiting for browser sign-in..." : "Authenticate in browser"}
            </Button>
          ) : awaiting ? (
            <div className="grid gap-3">
              <p className="text-sm text-text-secondary">
                Waiting for you to finish signing in in the opened tab&hellip;
              </p>
              {authUrl ? (
                <a
                  className="text-sm text-accent hover:underline"
                  href={authUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Reopen sign-in page
                </a>
              ) : null}
              <Button
                variant="secondary"
                className="justify-self-start"
                onClick={() => void checkOnce()}
                type="button"
              >
                Check now
              </Button>
            </div>
          ) : (
            <Button
              disabled={props.startBusy}
              onClick={() => void handleStartHosted()}
              type="button"
            >
              {props.startBusy ? "Preparing sign-in..." : "Authenticate"}
            </Button>
          )}

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-surface pt-4">
          <Button variant="secondary" disabled={busy} onClick={props.onClose} type="button">
            {busy ? "Cancel disabled" : "Close"}
          </Button>
        </div>
      </div>
    </div>
  );

  async function handleAuthenticateBrowser() {
    setError(undefined);

    try {
      await props.onAuthenticate();
    } catch (nextError) {
      setError(readError(nextError));
    }
  }

  async function handleStartHosted() {
    setError(undefined);

    try {
      const url = await props.onStartHosted();
      setAuthUrl(url);
      window.open(url, "_blank", "noopener,noreferrer");
      setAwaiting(true);
      startPolling();
    } catch (nextError) {
      setError(readError(nextError));
    }
  }

  function startPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
    }

    pollRef.current = setInterval(() => {
      void checkOnce();
    }, 2500);
  }

  async function checkOnce() {
    try {
      const updated = await props.onRefresh();
      if (updated?.runtimeStatus?.status === "connected") {
        if (pollRef.current) {
          clearInterval(pollRef.current);
        }
        props.onConnected(updated.name);
      }
    } catch {
      // Transient refresh failures are ignored; polling continues.
    }
  }
}
