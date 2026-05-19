import { useNavigate, useParams } from "react-router-dom";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConversationMessage, ConversationPart, LiveRequest } from "@cc/shared/schemas";

import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatSplitPaneLayout } from "@/components/chat/ChatSplitPaneLayout";
import { MediaTab } from "@/components/chat/MediaTab";
import { MessageTimeline } from "@/components/chat/MessageTimeline";
import { PermissionDock } from "@/components/chat/PermissionDock";
import { QuestionDock } from "@/components/chat/QuestionDock";
import { SessionSettingsTab } from "@/components/chat/SessionSettingsTab";
import { TodoDock } from "@/components/chat/TodoDock";
import { ErrorState, LoadingState } from "@/components/common/PageStates";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { QuickFileModal } from "@/components/workspace/QuickFileModal";
import { QuickFilePanel } from "@/components/workspace/QuickFilePanel";
import { WorkspaceFilesTab } from "@/components/workspace/WorkspaceFilesTab";
import { useChatInspectionTabs } from "@/hooks/use-chat-inspection-tabs";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useConversation } from "@/hooks/use-conversation";
import { useAgentCatalogQuery } from "@/hooks/use-agents-query";
import { resolveAgentWorkspacePath } from "@/lib/agent-workspace-path";
import { recordRecentAgent } from "@/lib/recent-agents";
import {
  createTaskPrefillFromUserMessage,
  type TaskCreationPrefill,
} from "@/services/task-prefill-service";

const DevDebugPanel = import.meta.env.DEV
  ? lazy(() => import("@/components/dev/DevDebugPanel").then((m) => ({ default: m.DevDebugPanel })))
  : null;

const WorkspaceTerminalPane = lazy(() =>
  import("@/components/chat/WorkspaceTerminalPane").then((m) => ({
    default: m.WorkspaceTerminalPane,
  })),
);

export function WorkspaceChatPage() {
  const { agentId: agentSlug, conversationId: urlConversationId } = useParams<{
    agentId: string;
    conversationId?: string;
  }>();
  const navigate = useNavigate();
  const conv = useConversation(agentSlug ?? "", urlConversationId);
  const { data: catalog } = useAgentCatalogQuery();
  const isDesktop = useMediaQuery("(min-width: 1200px)");
  const inspection = useChatInspectionTabs(conv.conversation?.id);
  const resolveLiveRequest = conv.resolveLiveRequest;
  const [activeContextTabId, setActiveContextTabId] = useState("files");
  const [mediaSearchQuery, setMediaSearchQuery] = useState("");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [bottomPaneHeight, setBottomPaneHeight] = useState<number>();
  const [pendingTaskPrefill, setPendingTaskPrefill] = useState<TaskCreationPrefill | null>(null);
  const autoResolvedLiveRequestIdsRef = useRef(new Set<string>());

  // Sync URL when conversation changes (initial load or switching)
  const prevConvIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const id = conv.conversation?.id;
    if (!id || !agentSlug) return;
    if (id === urlConversationId) return;
    if (id === prevConvIdRef.current) return;
    prevConvIdRef.current = id;
    const isInitial = !urlConversationId;
    void navigate(`/chat/${agentSlug}/${id}`, { replace: isInitial });
  }, [conv.conversation?.id, agentSlug, urlConversationId, navigate]);

  const skills = useMemo(() => {
    if (!conv.agent || !catalog) return undefined;
    const slugs = new Set([
      ...conv.agent.capabilities.builtInSkills,
      ...(conv.agent.capabilities.workspaceSkills ?? []),
    ]);
    return [...catalog.builtInSkills, ...(catalog.workspaceSkills ?? [])]
      .filter((s) => slugs.has(s.slug))
      .map((s) => ({ slug: s.slug, description: s.description }));
  }, [conv.agent, catalog]);

  useEffect(() => {
    setMediaSearchQuery("");
    setActiveContextTabId("files");
  }, [conv.conversation?.id]);

  useEffect(() => {
    const defaultHeight = Math.round(window.innerHeight * 0.4);
    setBottomPaneHeight(defaultHeight);
  }, []);

  useEffect(() => {
    if (!conv.agent) {
      return;
    }

    recordRecentAgent({
      id: conv.agent.id,
      slug: conv.agent.slug,
      name: conv.agent.name,
      role: conv.agent.role,
      iconPath: conv.agent.iconPath,
    });
  }, [conv.agent]);

  useEffect(() => {
    const activeIds = new Set(conv.liveRequests.map((request) => request.id));

    for (const request of conv.liveRequests) {
      if (request.kind === "show_file_to_user") {
        const path = getShowFilePath(request, agentSlug);

        if (path && agentSlug && !autoResolvedLiveRequestIdsRef.current.has(request.id)) {
          autoResolvedLiveRequestIdsRef.current.add(request.id);
          inspection.openFile({
            root: "workspace",
            path: resolveAgentWorkspacePath(agentSlug, path),
            displayPath: path,
          });
          void resolveLiveRequest(request.id, "opened", {}).catch(() => {
            autoResolvedLiveRequestIdsRef.current.delete(request.id);
          });
        }

        continue;
      }

      inspection.openLiveRequest(request);
    }

    for (const tab of inspection.tabs) {
      if (tab.tabType === "live-request" && !activeIds.has(tab.request.id)) {
        inspection.removeLiveRequest(tab.request.id);
      }
    }
  }, [agentSlug, conv.liveRequests, inspection, resolveLiveRequest]);

  const handleAttachmentMediaSearch = (filename: string) => {
    setMediaSearchQuery(filename);
    setActiveContextTabId("media");
  };

  const navigateToTaskCreation = useCallback(
    (prefill: TaskCreationPrefill) => {
      void navigate("/tasks/new", { state: { taskPrefill: prefill } });
    },
    [navigate],
  );

  const handleConvertUserMessageToTask = useCallback(
    (message: ConversationMessage, parts: ConversationPart[]) => {
      if (!conv.agent) {
        return;
      }

      const result = createTaskPrefillFromUserMessage({
        message,
        parts,
        agentId: conv.agent.id,
        skills,
      });

      if (result.hasUnsupportedAttachments) {
        setPendingTaskPrefill(result.prefill);
        return;
      }

      navigateToTaskCreation(result.prefill);
    },
    [conv.agent, navigateToTaskCreation, skills],
  );

  const handleConfirmAttachmentWarning = useCallback(() => {
    if (!pendingTaskPrefill) {
      return;
    }

    const prefill = pendingTaskPrefill;
    setPendingTaskPrefill(null);
    navigateToTaskCreation(prefill);
  }, [navigateToTaskCreation, pendingTaskPrefill]);

  const handleOpenQuickFile = (path: string) => {
    if (!agentSlug) {
      return;
    }

    inspection.openFile({
      root: "workspace",
      path: resolveAgentWorkspacePath(agentSlug, path),
      displayPath: path,
    });
  };

  if (conv.status === "loading") {
    return <LoadingState />;
  }

  if (conv.status === "error" || !conv.conversation) {
    return (
      <ErrorState
        title="Failed to load conversation"
        description={conv.error ?? "Something went wrong."}
      />
    );
  }

  return (
    <>
      <WorkspaceLayout
        contextPane={{
          title: "Workspace",
          activeTabId: activeContextTabId,
          onTabChange: setActiveContextTabId,
          tabs: [
            {
              id: "files",
              label: "Files",
              content: (
                <WorkspaceFilesTab
                  agentId={conv.agent?.id ?? ""}
                  agentSlug={agentSlug ?? ""}
                  onOpenFile={handleOpenQuickFile}
                />
              ),
            },
            {
              id: "media",
              label: "Media",
              content: (
                <MediaTab
                  conversationId={conv.conversation.id}
                  onOpenItem={inspection.openMedia}
                  onSearchQueryChange={setMediaSearchQuery}
                  searchQuery={mediaSearchQuery}
                />
              ),
            },
            {
              id: "settings",
              label: "Settings",
              ariaLabel: "Agent settings",
              iconOnly: true,
              icon: <SettingsIcon />,
              content: <SessionSettingsTab agentSlug={agentSlug ?? ""} />,
            },
          ],
          defaultTabId: "files",
        }}
        bottomPane={
          terminalOpen
            ? {
                title: "Workspace terminal",
                tabs: [
                  {
                    id: "terminal",
                    label: "Terminal",
                    content: (
                      <Suspense
                        fallback={
                          <div className="flex h-full items-center justify-center text-sm text-text-secondary">
                            Loading terminal...
                          </div>
                        }
                      >
                        <WorkspaceTerminalPane defaultCwd={conv.agent?.workspacePath} />
                      </Suspense>
                    ),
                  },
                ],
                defaultHeight: bottomPaneHeight,
                minHeight: 160,
                maxHeight: Math.round(window.innerHeight * 0.7),
                open: terminalOpen,
                onOpenChange: setTerminalOpen,
                compactHeader: true,
              }
            : undefined
        }
        primary={
          <div className="relative flex h-full flex-col overflow-hidden">
            <ChatHeader
              agentId={conv.agent?.id ?? ""}
              agentIconPath={conv.agent?.iconPath}
              agentName={conv.agent?.name ?? agentSlug ?? "Agent"}
              agentRole={conv.agent?.role ?? ""}
              currentConversationId={conv.conversation.id}
              onStartFresh={conv.startFresh}
              onSelectConversation={conv.switchConversation}
              terminalOpen={terminalOpen}
              quickEditorAvailable={inspection.tabs.length > 0}
              quickEditorOpen={inspection.open && inspection.tabs.length > 0}
              onToggleQuickEditor={() => inspection.setOpen(!inspection.open)}
              onToggleTerminal={() => setTerminalOpen((current) => !current)}
            />

            <ChatSplitPaneLayout
              main={
                <div className="flex h-full min-h-0 flex-col overflow-hidden">
                  <MessageTimeline
                    messages={conv.conversation.messages}
                    parts={conv.parts}
                    sessionStatus={conv.sessionStatus}
                    sendError={conv.sendError}
                    onAttachmentClick={handleAttachmentMediaSearch}
                    onConvertUserMessageToTask={handleConvertUserMessageToTask}
                  />

                  {conv.pendingPermission ? (
                    <PermissionDock
                      permission={conv.pendingPermission}
                      pendingCount={conv.pendingPermissionCount}
                      onReply={conv.replyPermission}
                    />
                  ) : conv.pendingQuestion ? (
                    <QuestionDock
                      question={conv.pendingQuestion}
                      onReply={conv.replyQuestion}
                      onReject={conv.rejectQuestion}
                    />
                  ) : (
                    <>
                      {conv.todos.length > 0 && <TodoDock todos={conv.todos} />}
                      <ChatComposer
                        onSend={(input) =>
                          conv.sendUserPrompt(input.text, input.attachments, input.model)
                        }
                        onShell={conv.sendShell}
                        onCommand={conv.sendCommand}
                        onSummarize={conv.summarize}
                        onAbort={conv.abort}
                        onStartFresh={conv.startFresh}
                        agentStatus={conv.agentStatus}
                        agentId={conv.agent?.id ?? ""}
                        autoApprove={conv.autoApprove}
                        onAutoApproveChange={conv.setAutoApprove}
                        skills={skills}
                        autoFocusKey={conv.conversation.id}
                      />
                    </>
                  )}
                </div>
              }
              sidePane={
                isDesktop && inspection.open && inspection.tabs.length > 0 ? (
                  <QuickFilePanel
                    controller={inspection}
                    onCancelLiveRequest={conv.cancelLiveRequest}
                    onClosePane={() => inspection.setOpen(false)}
                    onResolveLiveRequest={conv.resolveLiveRequest}
                  />
                ) : undefined
              }
            />
          </div>
        }
      />
      {!isDesktop && inspection.open && inspection.tabs.length > 0 ? (
        <QuickFileModal
          controller={inspection}
          onCancelLiveRequest={conv.cancelLiveRequest}
          onClosePane={() => inspection.setOpen(false)}
          onResolveLiveRequest={conv.resolveLiveRequest}
        />
      ) : null}
      {DevDebugPanel && conv.__injectEvent && (
        <Suspense>
          <DevDebugPanel
            injectEvent={conv.__injectEvent}
            messageId={conv.conversation?.messages.filter((m) => m.role === "assistant").at(-1)?.id}
            sessionId="debug"
          />
        </Suspense>
      )}
      {pendingTaskPrefill ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            aria-describedby="attachment-warning-description"
            aria-labelledby="attachment-warning-title"
            aria-modal="true"
            className="cc-panel w-full max-w-md p-5"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setPendingTaskPrefill(null);
                return;
              }

              if (event.key !== "Tab") {
                return;
              }

              const focusableElements = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
                ),
              ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1);

              if (focusableElements.length === 0) {
                event.preventDefault();
                return;
              }

              const firstElement = focusableElements[0];
              const lastElement = focusableElements[focusableElements.length - 1];

              if (!firstElement || !lastElement) {
                event.preventDefault();
                return;
              }

              const activeElement = document.activeElement;

              if (event.shiftKey) {
                if (
                  activeElement === firstElement ||
                  !event.currentTarget.contains(activeElement)
                ) {
                  event.preventDefault();
                  lastElement.focus();
                }
                return;
              }

              if (activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
              }
            }}
            role="alertdialog"
          >
            <h2 className="text-lg font-semibold text-text-primary" id="attachment-warning-title">
              Attachments cannot be copied
            </h2>
            <p
              className="mt-2 text-sm leading-6 text-text-secondary"
              id="attachment-warning-description"
            >
              Task prompts do not support chat attachments. Continue without attachments, then
              upload the files and mention them while creating the task if they are still needed.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                autoFocus
                className="cc-button cc-button-secondary"
                onClick={() => setPendingTaskPrefill(null)}
                type="button"
              >
                Cancel
              </button>
              <button className="cc-button" onClick={handleConfirmAttachmentWarning} type="button">
                Continue without attachments
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function getShowFilePath(request: LiveRequest, agentSlug?: string): string | undefined {
  const path = request.metadata["path"];

  if (typeof path !== "string") {
    return undefined;
  }

  const normalizedPath = path.trim().replace(/^\/+/, "");

  if (normalizedPath.length === 0) {
    return undefined;
  }

  if (!agentSlug) {
    return normalizedPath;
  }

  const agentPrefix = `agents/${agentSlug}/`;
  const agentPrefixIndex = normalizedPath.lastIndexOf(agentPrefix);

  if (agentPrefixIndex >= 0) {
    const relativePath = normalizedPath.slice(agentPrefixIndex + agentPrefix.length);
    return relativePath.length > 0 ? relativePath : undefined;
  }

  return normalizedPath;
}

function SettingsIcon() {
  return (
    <svg fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path
        d="M10.3 3.5h3.4l.5 2a7 7 0 0 1 1.6.9l1.9-.7 1.7 3-1.5 1.3a7 7 0 0 1 0 1.9l1.5 1.3-1.7 3-1.9-.7a7 7 0 0 1-1.6.9l-.5 2h-3.4l-.5-2a7 7 0 0 1-1.6-.9l-1.9.7-1.7-3 1.5-1.3a7 7 0 0 1 0-1.9L4.6 8.7l1.7-3 1.9.7a7 7 0 0 1 1.6-.9z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="2.7" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
