import { useParams, useNavigate } from "react-router-dom";
import { lazy, Suspense, useMemo, useEffect, useRef, useState } from "react";

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
import { useMediaQuery } from "@/hooks/use-media-query";
import { useQuickFile } from "@/hooks/use-quick-file";
import { useConversation } from "@/hooks/use-conversation";
import { useAgentCatalogQuery } from "@/hooks/use-agents-query";
import { resolveAgentWorkspacePath } from "@/lib/agent-workspace-path";
import { recordRecentAgent } from "@/lib/recent-agents";

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
  const quickFile = useQuickFile();
  const [activeContextTabId, setActiveContextTabId] = useState("files");
  const [mediaSearchQuery, setMediaSearchQuery] = useState("");
  const [quickEditorOpen, setQuickEditorOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [bottomPaneHeight, setBottomPaneHeight] = useState<number>();

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
    const slugs = new Set(conv.agent.capabilities.builtInSkills);
    return catalog.builtInSkills
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
    });
  }, [conv.agent]);

  const handleAttachmentMediaSearch = (filename: string) => {
    setMediaSearchQuery(filename);
    setActiveContextTabId("media");
  };

  const handleOpenQuickFile = (path: string) => {
    if (!agentSlug) {
      return;
    }

    void quickFile.open({
      root: "workspace",
      path: resolveAgentWorkspacePath(agentSlug, path),
      displayPath: path,
    });
    setQuickEditorOpen(true);
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
              agentName={conv.agent?.name ?? agentSlug ?? "Agent"}
              agentRole={conv.agent?.role ?? ""}
              currentConversationId={conv.conversation.id}
              onStartFresh={conv.startFresh}
              onSelectConversation={conv.switchConversation}
              terminalOpen={terminalOpen}
              quickEditorAvailable={quickFile.file !== undefined}
              quickEditorOpen={quickEditorOpen && quickFile.file !== undefined}
              onToggleQuickEditor={() => setQuickEditorOpen((current) => !current)}
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
                isDesktop && quickEditorOpen && quickFile.file ? (
                  <QuickFilePanel
                    controller={quickFile}
                    onClosePane={() => setQuickEditorOpen(false)}
                  />
                ) : undefined
              }
            />
          </div>
        }
      />
      {!isDesktop && quickEditorOpen && quickFile.file ? (
        <QuickFileModal controller={quickFile} onClosePane={() => setQuickEditorOpen(false)} />
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
    </>
  );
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
