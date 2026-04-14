import { useParams } from "react-router-dom";

import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageTimeline } from "@/components/chat/MessageTimeline";
import { PermissionDock } from "@/components/chat/PermissionDock";
import { QuestionDock } from "@/components/chat/QuestionDock";
import { TodoDock } from "@/components/chat/TodoDock";
import { ErrorState, LoadingState } from "@/components/common/PageStates";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { useConversation } from "@/hooks/use-conversation";

export function WorkspaceChatPage() {
  const { agentId: agentSlug } = useParams<{ agentId: string }>();
  const conv = useConversation(agentSlug ?? "");

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
    <WorkspaceLayout
      primary={
        <div className="flex h-full flex-col">
          <ChatHeader
            agentName={conv.agent?.name ?? agentSlug ?? "Agent"}
            conversationTitle={conv.conversation.title ?? undefined}
            previousConversations={conv.previousConversations}
            currentConversationId={conv.conversation.id}
            onStartFresh={conv.startFresh}
            onSelectConversation={conv.switchConversation}
          />

          <MessageTimeline
            messages={conv.conversation.messages}
            parts={conv.parts}
            agentStatus={conv.agentStatus}
          />

          {conv.pendingPermission ? (
            <PermissionDock permission={conv.pendingPermission} onReply={conv.replyPermission} />
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
                onSend={conv.sendUserPrompt}
                onAbort={conv.abort}
                agentStatus={conv.agentStatus}
              />
            </>
          )}
        </div>
      }
    />
  );
}
