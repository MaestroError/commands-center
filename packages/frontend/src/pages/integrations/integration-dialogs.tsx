// Split out of IntegrationsPage.tsx (issue #99).

import { PasswordInput } from "@/components/common/PasswordInput";
import type { McpServer } from "@cc/shared/schemas";
import { useEffect, useRef, useState } from "react";
import { COMPOSIO_API_KEY_HEADER, DEFAULT_COMPOSIO_NAME, readError } from "./integration-helpers";
import { CloseIcon } from "./integration-icons";
import { Field } from "./mcp-server-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ComposioDialog(props: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; apiKey: string }) => Promise<void>;
}) {
  const [name, setName] = useState(DEFAULT_COMPOSIO_NAME);
  const [apiKey, setApiKey] = useState("");
  const [submitError, setSubmitError] = useState<string>();

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
              CC manages the endpoint and transport. Authenticate with your Composio API key.
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
              }}
              value={name}
            />
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
              Sent through the predefined <code>{COMPOSIO_API_KEY_HEADER}</code> header.
            </p>
          </Field>

          {submitError ? <p className="text-sm text-danger">{submitError}</p> : null}

          <div className="mt-2 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button variant="secondary" onClick={props.onClose} type="button">
              Cancel
            </Button>
            <Button disabled={props.busy} type="submit">
              {props.busy ? "Connecting..." : "Activate Composio"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(undefined);

    if (!name.trim()) {
      setSubmitError("Name is required.");
      return;
    }

    if (!apiKey.trim()) {
      setSubmitError("API key is required.");
      return;
    }

    try {
      await props.onSubmit({
        name: name.trim(),
        apiKey: apiKey.trim(),
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
