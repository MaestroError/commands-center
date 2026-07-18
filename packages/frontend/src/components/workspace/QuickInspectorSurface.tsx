import { useCallback, useEffect, useState } from "react";
import { File as FileIcon, Image as ImageIcon, KeyRound, X } from "lucide-react";

import { isLiveRequestReviewKind } from "../live-requests/live-request-helpers";
import { LiveRequestPane } from "../live-requests/LiveRequestPane";
import { LiveRequestReviewForm } from "../live-requests/LiveRequestReviewForm";
import { WorkspaceFileSurface } from "./WorkspaceFileSurface";

import type { FileManagerFileRevision } from "@cc/shared/schemas";
import type { ChatInspectionTab, UseChatInspectionTabs } from "@/hooks/use-chat-inspection-tabs";
import { buttonVariants } from "@/components/ui/button-variants";

type Props = {
  controller: UseChatInspectionTabs;
  onResolveLiveRequest?: (
    requestId: string,
    action: string,
    values: Record<string, string>,
  ) => Promise<void>;
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
                  className="inline-block h-2 w-2 shrink-0 rounded-full bg-warning"
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
        ) : isLiveRequestReviewKind(controller.activeTab.request.kind) ? (
          <LiveRequestReviewForm
            request={controller.activeTab.request}
            onCancel={props.onCancelLiveRequest}
            onResolve={props.onResolveLiveRequest}
          />
        ) : (
          <LiveRequestPane
            request={controller.activeTab.request}
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
          className={buttonVariants({ variant: "secondary" })}
          href={item.url}
          rel="noreferrer"
          target="_blank"
        >
          Open in new tab
        </a>
        <a className={buttonVariants({})} download={item.filename ?? "download"} href={item.url}>
          Download
        </a>
      </div>
    </div>
  );
}
