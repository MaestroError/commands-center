import { useNavigate, useParams } from "react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConversationMessage, ConversationPart, LiveRequest } from "@cc/shared/schemas";

import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatSplitPaneLayout } from "@/components/chat/ChatSplitPaneLayout";
import { MediaTab } from "@/components/chat/MediaTab";
import { MessageTimeline } from "@/components/chat/MessageTimeline";
import { PermissionDock } from "@/components/chat/PermissionDock";
import { QuestionDock } from "@/components/chat/QuestionDock";
import { SystemPromptsTab } from "@/components/chat/SystemPromptsTab";
import { TodoDock } from "@/components/chat/TodoDock";
import { ToolsTab } from "@/components/chat/ToolsTab";
import { ChatResultsPanel } from "@/components/chat/ChatResultsPanel";
import { PendingInteractionProvider } from "@/components/chat/tools/PendingInteractionProvider";
import type { PendingToolInteraction } from "@/components/chat/tools/pending-interaction-context";
import { buildPendingInteractionMap } from "@/components/chat/tools/pending-interaction-map";
import { ErrorState, LoadingState } from "@/components/common/PageStates";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { QuickFileModal } from "@/components/workspace/QuickFileModal";
import { QuickFilePanel } from "@/components/workspace/QuickFilePanel";
import { WorkspaceFilesTab } from "@/components/workspace/WorkspaceFilesTab";
import { useChatInspectionTabs } from "@/hooks/use-chat-inspection-tabs";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useConversation } from "@/hooks/use-conversation";
import { useSpecialistCatalogQuery } from "@/hooks/use-specialists-query";
import { useTaskMutations } from "@/hooks/use-tasks-query";
import { resolveSpecialistWorkspacePath } from "@/lib/specialist-workspace-path";
import { recordRecentSpecialist } from "@/lib/recent-specialists";
import {
  createTaskPrefillFromUserMessage,
  type TaskCreationPrefill,
} from "@/services/task-prefill-service";
import { Button } from "@/components/ui/button";

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
  const { data: catalog } = useSpecialistCatalogQuery();
  const isDesktop = useMediaQuery("(min-width: 1200px)");
  const inspection = useChatInspectionTabs(conv.conversation?.id);
  const taskMutations = useTaskMutations();
  const resolveLiveRequest = conv.resolveLiveRequest;
  const replyPermission = conv.replyPermission;
  const rejectQuestion = conv.rejectQuestion;
  const cancelLiveRequest = conv.cancelLiveRequest;
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
    if (!conv.agent) return undefined;

    const slugs = new Set([
      ...conv.agent.capabilities.builtInSkills,
      ...(conv.agent.capabilities.workspaceSkills ?? []),
    ]);

    if (!catalog) {
      return [...slugs].map((slug) => ({ slug }));
    }

    return [...catalog.builtInSkills, ...(catalog.workspaceSkills ?? [])]
      .filter((s) => slugs.has(s.slug))
      .map((s) => ({ slug: s.slug, description: s.description }));
  }, [conv.agent, catalog]);

  // Links a tool call to the pending permission / question / live request
  // blocking it, so the status dot on that tool row can offer a cancel
  // affordance.
  const conversationMessages = conv.conversation?.messages;
  const pendingInteractionsByCallId = useMemo(
    () =>
      buildPendingInteractionMap({
        permissions: conv.pendingPermissions,
        question: conv.pendingQuestion,
        liveRequests: conv.liveRequests,
        messages: conversationMessages ?? [],
        parts: conv.parts,
      }),
    [
      conv.pendingPermissions,
      conv.pendingQuestion,
      conv.liveRequests,
      conversationMessages,
      conv.parts,
    ],
  );

  const cancelPendingInteraction = useCallback(
    (interaction: PendingToolInteraction) => {
      if (interaction.kind === "permission") {
        replyPermission(interaction.requestId, "reject");
      } else if (interaction.kind === "question") {
        rejectQuestion(interaction.requestId);
      } else {
        // Swallow rejections: the request may already be resolved/gone by the
        // time the dot is clicked, which is a no-op, not an error to surface.
        void cancelLiveRequest(interaction.requestId).catch(() => {});
      }
    },
    [replyPermission, rejectQuestion, cancelLiveRequest],
  );

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

    recordRecentSpecialist({
      id: conv.agent.id,
      slug: conv.agent.slug,
      name: conv.agent.name,
      role: conv.agent.role,
      iconPath: conv.agent.iconPath,
    });
  }, [conv.agent]);

  // Destructure the stable pieces the sync effect needs. Depending on the
  // whole `inspection` object would re-run the effect every render (it's a
  // fresh object literal each time); these callbacks are useCallback-stable and
  // `inspectionTabs` only changes when tabs actually change.
  const { openFile, openLiveRequest, removeLiveRequest, tabs: inspectionTabs } = inspection;

  useEffect(() => {
    const activeIds = new Set(conv.liveRequests.map((request) => request.id));

    for (const request of conv.liveRequests) {
      if (request.kind === "show_file_to_user") {
        const path = getShowFilePath(request, agentSlug);

        if (path && agentSlug && !autoResolvedLiveRequestIdsRef.current.has(request.id)) {
          autoResolvedLiveRequestIdsRef.current.add(request.id);
          openFile({
            root: "workspace",
            path: resolveSpecialistWorkspacePath(agentSlug, path),
            displayPath: path,
          });
          void resolveLiveRequest(request.id, "opened", {}).catch(() => {
            autoResolvedLiveRequestIdsRef.current.delete(request.id);
          });
        }

        continue;
      }

      openLiveRequest(request);
    }

    for (const tab of inspectionTabs) {
      if (tab.tabType === "live-request" && !activeIds.has(tab.request.id)) {
        removeLiveRequest(tab.request.id);
      }
    }
  }, [
    agentSlug,
    conv.liveRequests,
    inspectionTabs,
    openFile,
    openLiveRequest,
    removeLiveRequest,
    resolveLiveRequest,
  ]);

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
      path: resolveSpecialistWorkspacePath(agentSlug, path),
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

  const conversationId = conv.conversation.id;

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
                  onAddArtifact={async (file) => {
                    await taskMutations.addConversationArtifact.mutateAsync({
                      conversationId,
                      input: { title: file.name, type: "file", link: file.path },
                    });
                  }}
                  onOpenFile={handleOpenQuickFile}
                />
              ),
            },
            {
              id: "media",
              label: "Uploads",
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
              id: "tools",
              label: "Tools",
              content: <ToolsTab agent={conv.agent} catalog={catalog} />,
            },
            {
              id: "system-prompts",
              label: "Prompts",
              content: (
                <SystemPromptsTab
                  conversationId={conv.conversation.id}
                  onEditInSettings={() => void navigate("/settings?tab=system-prompts")}
                />
              ),
            },
          ],
          defaultTabId: "files",
          footer: <ChatResultsPanel conversationId={conv.conversation.id} />,
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
              specialistName={conv.agent?.name ?? agentSlug ?? "Specialist"}
              specialistRole={conv.agent?.role ?? ""}
              currentConversationId={conv.conversation.id}
              onStartFresh={conv.startFresh}
              onSelectConversation={conv.switchConversation}
              terminalOpen={terminalOpen}
              quickEditorAvailable={inspection.tabs.length > 0}
              quickEditorOpen={inspection.open && inspection.tabs.length > 0}
              onToggleQuickEditor={() => inspection.setOpen(!inspection.open)}
              onToggleTerminal={() => setTerminalOpen((current) => !current)}
            />

            {conv.conversation.taskId && conv.conversation.taskRunId ? (
              <section className="border-b border-border bg-accent/10 px-4 py-3 text-sm text-text-primary">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p>This chat continues task run {conv.conversation.taskRunId}.</p>
                  <a
                    className="font-medium text-accent underline-offset-4 hover:underline"
                    href={`/tasks/${encodeURIComponent(conv.conversation.taskId)}/runs/${encodeURIComponent(conv.conversation.taskRunId)}`}
                  >
                    Back to task run
                  </a>
                </div>
              </section>
            ) : null}

            <ChatSplitPaneLayout
              main={
                <div className="flex h-full min-h-0 flex-col overflow-hidden">
                  <PendingInteractionProvider
                    byCallId={pendingInteractionsByCallId}
                    cancel={cancelPendingInteraction}
                  >
                    <MessageTimeline
                      messages={conv.conversation.messages}
                      parts={conv.parts}
                      sessionStatus={conv.sessionStatus}
                      sendError={conv.sendError}
                      conversationId={conv.conversation.id}
                      onAttachmentClick={handleAttachmentMediaSearch}
                      onConvertUserMessageToTask={handleConvertUserMessageToTask}
                    />
                  </PendingInteractionProvider>

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
                        defaultModel={conv.agent?.defaultModel}
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
        <AlertDialog
          onOpenChange={(open) => {
            if (!open) {
              setPendingTaskPrefill(null);
            }
          }}
          open
        >
          <AlertDialogContent className="max-w-md p-5">
            <AlertDialogTitle className="text-lg">Attachments cannot be copied</AlertDialogTitle>
            <AlertDialogDescription className="mt-2">
              Task prompts do not support chat attachments. Continue without attachments, then
              upload the files and mention them while creating the task if they are still needed.
            </AlertDialogDescription>
            <AlertDialogFooter className="mt-5">
              <AlertDialogCancel asChild>
                <Button variant="secondary" autoFocus type="button">
                  Cancel
                </Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button onClick={handleConfirmAttachmentWarning} type="button">
                  Continue without attachments
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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

  const agentPrefix = `specialists/${agentSlug}/`;
  const agentPrefixIndex = normalizedPath.lastIndexOf(agentPrefix);

  if (agentPrefixIndex >= 0) {
    const relativePath = normalizedPath.slice(agentPrefixIndex + agentPrefix.length);
    return relativePath.length > 0 ? relativePath : undefined;
  }

  return normalizedPath;
}
