import { useCallback, useEffect, useState } from "react";
import { File as FileIcon, Image as ImageIcon, KeyRound, X } from "lucide-react";

import { WorkspaceFileSurface } from "./WorkspaceFileSurface";

import type { FileManagerFileRevision } from "@cc/shared/schemas";
import type { ChatInspectionTab, UseChatInspectionTabs } from "@/hooks/use-chat-inspection-tabs";

type Props = {
  controller: UseChatInspectionTabs;
  onResolveLiveRequest?: (requestId: string, values: Record<string, string>) => Promise<void>;
  onCancelLiveRequest?: (requestId: string, reason?: string) => Promise<void>;
};

export function QuickInspectorSurface(props: Props) {
  const { controller } = props;

  if (controller.tabs.length === 0 || !controller.activeTab) {
    return null;
  }

  return (
    <div className="flex h-full min-h-[24rem] flex-col" data-testid="quick-inspector-surface">
      <div
        aria-label="Open inspections"
        className="flex h-12 shrink-0 items-stretch overflow-x-auto border-b border-border bg-background"
        role="tablist"
      >
        {controller.tabs.map((tab) => {
          const active = controller.activeKey === tab.key;

          return (
            <button
              aria-controls="quick-inspector-panel"
              aria-selected={active}
              className={[
                "group relative flex h-full max-w-[18rem] shrink-0 items-center gap-2 border-r border-border px-3 text-sm transition-colors",
                active
                  ? "bg-surface font-medium text-text-primary"
                  : "bg-background text-text-secondary hover:bg-surface/60",
              ].join(" ")}
              data-testid={`quick-inspector-tab-${tab.key}`}
              key={tab.key}
              onClick={() => controller.setActive(tab.key)}
              role="tab"
              type="button"
            >
              <TabIcon tab={tab} />
              <span className="min-w-0 flex-1 truncate">{tab.name}</span>
              {active ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-accent"
                />
              ) : null}
              {tab.tabType === "file" && tab.dirty ? (
                <span
                  aria-label="Unsaved changes"
                  className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500"
                  data-testid={`quick-inspector-dirty-${tab.key}`}
                />
              ) : null}
              {tab.tabType !== "live-request" || tab.closable ? (
                <span
                  aria-label={`Close ${tab.name}`}
                  className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary opacity-60 hover:bg-border hover:opacity-100"
                  data-testid={`quick-inspector-close-${tab.key}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    controller.close(tab.key);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-auto" id="quick-inspector-panel">
        {controller.activeTab.tabType === "file" ? (
          <ActiveFilePane controller={controller} tab={controller.activeTab} />
        ) : controller.activeTab.tabType === "media" ? (
          <MediaPane tab={controller.activeTab} />
        ) : (
          <LiveRequestPane
            tab={controller.activeTab}
            onCancel={props.onCancelLiveRequest}
            onResolve={props.onResolveLiveRequest}
          />
        )}
      </div>
    </div>
  );
}

function TabIcon(props: { tab: ChatInspectionTab }) {
  if (props.tab.tabType === "file") {
    return <FileIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-70" />;
  }

  if (props.tab.tabType === "media") {
    return <ImageIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-70" />;
  }

  return <KeyRound aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-70" />;
}

function ActiveFilePane(props: {
  tab: Extract<ChatInspectionTab, { tabType: "file" }>;
  controller: UseChatInspectionTabs;
}) {
  const { controller, tab } = props;
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [conflict, setConflict] = useState<{
    currentRevision?: FileManagerFileRevision;
    message: string;
  }>();

  useEffect(() => {
    setBusy(false);
    setErrorMessage(undefined);
    setConflict(undefined);
  }, [tab.key]);

  const handleSave = useCallback(
    async (overrideRevision?: FileManagerFileRevision) => {
      if (busy) {
        return;
      }

      setBusy(true);
      setErrorMessage(undefined);

      try {
        const result = await controller.save(tab.key, { overrideRevision });

        if (result.ok) {
          setConflict(undefined);
          return;
        }

        if (result.conflict || result.error === undefined) {
          setConflict({
            currentRevision: result.conflict,
            message: "This file changed on disk since you opened it.",
          });
          return;
        }

        setErrorMessage(result.error);
      } finally {
        setBusy(false);
      }
    },
    [busy, controller, tab.key],
  );

  return (
    <WorkspaceFileSurface
      busy={busy}
      conflict={conflict}
      errorMessage={errorMessage}
      file={tab}
      showPreviewHeader={false}
      showTextPathLabel={false}
      onDiscardConflict={() => setConflict(undefined)}
      onDraftChange={(draft) => controller.updateDraft(tab.key, draft)}
      onReloadRequested={() => void controller.reload(tab.key)}
      onSaveRequested={(overrideRevision) => void handleSave(overrideRevision)}
    />
  );
}

function MediaPane(props: { tab: Extract<ChatInspectionTab, { tabType: "media" }> }) {
  const { item } = props.tab;

  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-background p-6 sm:items-center">
        {renderMediaItem(item)}
      </div>
    </div>
  );
}

function LiveRequestPane(props: {
  tab: Extract<ChatInspectionTab, { tabType: "live-request" }>;
  onResolve?: (requestId: string, values: Record<string, string>) => Promise<void>;
  onCancel?: (requestId: string, reason?: string) => Promise<void>;
}) {
  const { request } = props.tab;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      request.fields.map((field) => [
        field.name,
        "defaultValue" in field && typeof field.defaultValue === "string" ? field.defaultValue : "",
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    setValues(
      Object.fromEntries(
        request.fields.map((field) => [
          field.name,
          "defaultValue" in field && typeof field.defaultValue === "string"
            ? field.defaultValue
            : "",
        ]),
      ),
    );
    setBusy(false);
    setErrorMessage(undefined);
  }, [request]);

  async function handleSubmit() {
    if (!props.onResolve || busy) {
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
      await props.onResolve(request.id, values);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to submit request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
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
          <button
            className="cc-button"
            disabled={busy}
            type="button"
            onClick={() => void handleSubmit()}
          >
            {request.presentation.submitLabel}
          </button>
          <button
            className="cc-button-secondary"
            disabled={busy}
            type="button"
            onClick={() => void handleCancel()}
          >
            {request.presentation.cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function renderMediaItem(item: Extract<ChatInspectionTab, { tabType: "media" }>["item"]) {
  if (item.mime.startsWith("image/")) {
    return (
      <img
        alt={item.filename ?? "Shared image"}
        className="max-w-full rounded border border-border bg-surface sm:max-h-full"
        src={item.url}
      />
    );
  }

  if (item.mime.startsWith("video/")) {
    return (
      <video
        className="max-w-full rounded border border-border bg-surface sm:max-h-full"
        controls
        src={item.url}
      />
    );
  }

  if (item.mime === "application/pdf") {
    return (
      <iframe
        className="h-[75vh] w-full rounded border border-border bg-surface"
        src={item.url}
        title={item.filename ?? "PDF preview"}
      />
    );
  }

  return (
    <div className="max-w-md rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
      <p className="font-medium text-text-primary">{item.filename ?? "Untitled"}</p>
      <p className="mt-2">This media type cannot be previewed inline.</p>
      <p className="mt-4 break-all text-xs text-text-primary">{item.mime}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          className="cc-button cc-button-secondary"
          href={item.url}
          rel="noreferrer"
          target="_blank"
        >
          Open in new tab
        </a>
        <a className="cc-button" download={item.filename ?? "download"} href={item.url}>
          Download
        </a>
      </div>
    </div>
  );
}
