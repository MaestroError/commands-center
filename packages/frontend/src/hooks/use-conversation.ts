import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getActiveConversation,
  getConversation,
  startFreshConversation,
  sendPrompt,
  sendShell as apiSendShell,
  sendCommand as apiSendCommand,
  summarizeConversation,
  abortConversation,
  replyPermission as apiReplyPermission,
  replyQuestion as apiReplyQuestion,
  rejectQuestion as apiRejectQuestion,
  connectConversationEvents,
} from "@/lib/api";
import { useAgentQuery } from "@/hooks/use-agents-query";
import { queryKeys } from "@/lib/query-keys";
import type {
  Agent,
  ChatEvent,
  ConversationDetail,
  ConversationMessage,
  ConversationPart,
  ConversationSummary,
  SendConversationAttachmentInput,
  TodoItem,
} from "@cc/shared/schemas";

// --- State ---

type PermissionRequest = {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
};

type QuestionRequest = {
  id: string;
  sessionID: string;
  questions: Array<{
    question: string;
    header?: string;
    options: Array<{ label: string; description?: string }>;
    multiSelect?: boolean;
  }>;
};

/**
 * Parts are stored separately from messages, keyed by messageID.
 * This mirrors the OpenCode web app's approach: messages carry metadata,
 * parts carry content, and they're linked by messageID.
 */
export type ConversationState = {
  agentStatus: "idle" | "busy" | "retry";
  conversation: ConversationDetail | null;
  /** Parts keyed by messageID — populated by SSE events */
  parts: Record<string, ConversationPart[]>;
  previousConversations: ConversationSummary[];
  pendingPermissions: PermissionRequest[];
  pendingQuestion: QuestionRequest | null;
  todos: TodoItem[];
};

export type Action =
  | { type: "HYDRATE"; snapshot: { current: ConversationDetail; previous: ConversationSummary[] } }
  | { type: "HYDRATE_DETAIL"; detail: ConversationDetail; previous?: ConversationSummary[] }
  | { type: "OPTIMISTIC_USER_MESSAGE"; message: ConversationMessage }
  | { type: "SSE_EVENT"; event: ChatEvent };

export const initialState: ConversationState = {
  agentStatus: "idle",
  conversation: null,
  parts: {},
  previousConversations: [],
  pendingPermissions: [],
  pendingQuestion: null,
  todos: [],
};

/**
 * Build the parts map from hydrated messages so that parts from the initial
 * fetch are available immediately without waiting for SSE.
 */
function buildPartsMap(messages: ConversationMessage[]): Record<string, ConversationPart[]> {
  const map: Record<string, ConversationPart[]> = {};
  for (const msg of messages) {
    if (msg.parts.length > 0) {
      map[msg.id] = msg.parts;
    }
  }
  return map;
}

export function conversationReducer(state: ConversationState, action: Action): ConversationState {
  switch (action.type) {
    case "HYDRATE":
      return {
        ...state,
        conversation: action.snapshot.current,
        parts: buildPartsMap(action.snapshot.current.messages),
        previousConversations: action.snapshot.previous,
        agentStatus: "idle",
        pendingPermissions: [],
        pendingQuestion: null,
        todos: [],
      };

    case "HYDRATE_DETAIL":
      return {
        ...state,
        conversation: action.detail,
        parts: buildPartsMap(action.detail.messages),
        previousConversations: action.previous ?? state.previousConversations,
        agentStatus: "idle",
        pendingPermissions: [],
        pendingQuestion: null,
        todos: [],
      };

    case "OPTIMISTIC_USER_MESSAGE": {
      if (!state.conversation) return state;
      const msg = action.message;
      return {
        ...state,
        conversation: {
          ...state.conversation,
          messages: [...state.conversation.messages, msg],
        },
        parts: {
          ...state.parts,
          [msg.id]: msg.parts,
        },
      };
    }

    case "SSE_EVENT":
      return applySseEvent(state, action.event);

    default:
      return state;
  }
}

function applySseEvent(state: ConversationState, event: ChatEvent): ConversationState {
  switch (event.type) {
    case "session.status":
      return { ...state, agentStatus: event.properties.status };

    case "message.updated": {
      if (!state.conversation) return state;
      const msg = event.properties.message;
      const existing = state.conversation.messages.find((m) => m.id === msg.id);

      if (existing) {
        // Update metadata but preserve parts from the parts map
        const updated = { ...existing, ...msg, parts: existing.parts };
        return {
          ...state,
          conversation: {
            ...state.conversation,
            messages: state.conversation.messages.map((m) => (m.id === msg.id ? updated : m)),
          },
        };
      }

      // New message — also remove any optimistic user message with matching content
      let messages = state.conversation.messages;
      if (msg.role === "user") {
        messages = messages.filter((m) => !(m.id.startsWith("optimistic-") && m.role === "user"));
      }

      return {
        ...state,
        conversation: {
          ...state.conversation,
          messages: [...messages, msg],
        },
      };
    }

    case "message.removed": {
      if (!state.conversation) return state;
      const { messageID } = event.properties;
      const newParts = { ...state.parts };
      delete newParts[messageID];
      return {
        ...state,
        parts: newParts,
        conversation: {
          ...state.conversation,
          messages: state.conversation.messages.filter((m) => m.id !== messageID),
        },
      };
    }

    case "message.part.updated": {
      if (!state.conversation) return state;
      const { messageID, part } = event.properties;
      const existing = state.parts[messageID] ?? [];
      const idx = existing.findIndex((p) => p.id === part.id);
      const updatedParts =
        idx >= 0 ? existing.map((p, i) => (i === idx ? part : p)) : [...existing, part];

      return {
        ...state,
        parts: { ...state.parts, [messageID]: updatedParts },
      };
    }

    case "message.part.delta": {
      const { messageID, partID, field, delta } = event.properties;
      const existing = state.parts[messageID];
      if (!existing) return state;

      return {
        ...state,
        parts: {
          ...state.parts,
          [messageID]: existing.map((p) => {
            if (p.id !== partID) return p;
            const current = typeof p[field] === "string" ? p[field] : "";
            return { ...p, [field]: current + delta };
          }),
        },
      };
    }

    case "message.part.removed": {
      const { messageID, partID } = event.properties;
      const existing = state.parts[messageID];
      if (!existing) return state;

      return {
        ...state,
        parts: {
          ...state.parts,
          [messageID]: existing.filter((p) => p.id !== partID),
        },
      };
    }

    case "permission.asked":
      return {
        ...state,
        pendingPermissions: upsertPermissionRequest(
          state.pendingPermissions,
          event.properties as unknown as PermissionRequest,
        ),
      };

    case "permission.replied":
      return {
        ...state,
        pendingPermissions: state.pendingPermissions.filter(
          (request) => request.id !== (event.properties as { requestID?: string }).requestID,
        ),
      };

    case "question.asked":
      return {
        ...state,
        pendingQuestion: event.properties as unknown as QuestionRequest,
      };

    case "question.replied":
    case "question.rejected":
      return { ...state, pendingQuestion: null };

    case "todo.updated":
      return { ...state, todos: event.properties.todos };

    default:
      return state;
  }
}

// --- Hook ---

export type UseConversationReturn = {
  status: "loading" | "ready" | "error";
  error: string | null;
  agent: Agent | null;
  agentStatus: "idle" | "busy" | "retry";
  conversation: ConversationDetail | null;
  /** Parts keyed by messageID — use this to render message content */
  parts: Record<string, ConversationPart[]>;
  previousConversations: ConversationSummary[];
  pendingPermission: PermissionRequest | null;
  pendingPermissionCount: number;
  pendingQuestion: QuestionRequest | null;
  todos: TodoItem[];
  autoApprove: boolean;
  setAutoApprove: (enabled: boolean) => void;
  sendUserPrompt: (
    text: string,
    attachments?: SendConversationAttachmentInput[],
    model?: string,
  ) => void;
  sendShell: (command: string) => void;
  sendCommand: (command: string, args?: string) => void;
  summarize: () => void;
  abort: () => void;
  startFresh: () => void;
  switchConversation: (conversationId: string) => void;
  replyPermission: (requestId: string, reply: "once" | "always" | "reject") => void;
  replyQuestion: (requestId: string, answers: string[][]) => void;
  rejectQuestion: (requestId: string) => void;
  /** Dev-only: inject a mock SSE event into the reducer */
  __injectEvent?: (event: ChatEvent) => void;
};

export function useConversation(agentSlug: string, conversationId?: string): UseConversationReturn {
  const [state, dispatch] = useReducer(conversationReducer, initialState);
  const sseAbortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  // Auto-approve state with localStorage persistence
  const [autoApprove, setAutoApproveState] = useState(() => {
    try {
      return localStorage.getItem(`cc-auto-approve-${agentSlug}`) === "true";
    } catch {
      return false;
    }
  });
  const autoApproveRef = useRef(autoApprove);

  const setAutoApprove = useCallback(
    (enabled: boolean) => {
      setAutoApproveState(enabled);
      autoApproveRef.current = enabled;
      try {
        localStorage.setItem(`cc-auto-approve-${agentSlug}`, enabled ? "true" : "false");
      } catch {
        // Ignore storage errors
      }
    },
    [agentSlug],
  );

  // Keep ref in sync
  useEffect(() => {
    autoApproveRef.current = autoApprove;
  }, [autoApprove]);

  // 1. Resolve slug → agent
  const agentQuery = useAgentQuery(agentSlug);
  const agent = agentQuery.data ?? null;

  // 2. Fetch active conversation once we have the agent
  const snapshotQuery = useQuery({
    queryKey: queryKeys.conversationSnapshot(agent?.id ?? ""),
    queryFn: () => getActiveConversation(agent!.id),
    enabled: !!agent && !conversationId,
  });

  const specificQuery = useQuery({
    queryKey: queryKeys.conversation(agent?.id ?? "", conversationId ?? ""),
    queryFn: () => getConversation(agent!.id, conversationId!),
    enabled: !!agent && !!conversationId,
  });

  // Hydrate state from snapshot
  useEffect(() => {
    if (snapshotQuery.data) {
      dispatch({ type: "HYDRATE", snapshot: snapshotQuery.data });
    }
  }, [snapshotQuery.data]);

  useEffect(() => {
    if (specificQuery.data) {
      dispatch({ type: "HYDRATE_DETAIL", detail: specificQuery.data });
    }
  }, [specificQuery.data]);

  // 3. Manage SSE connection
  const activeConversationId = state.conversation?.id ?? null;

  useEffect(() => {
    if (!activeConversationId) return;
    if (conversationIdRef.current === activeConversationId && sseAbortRef.current) return;

    // Close previous connection
    sseAbortRef.current?.abort();

    const controller = new AbortController();
    sseAbortRef.current = controller;
    conversationIdRef.current = activeConversationId;

    void (async () => {
      try {
        for await (const event of connectConversationEvents(
          activeConversationId,
          controller.signal,
        )) {
          if (controller.signal.aborted) break;

          // Auto-approve: if permission.asked and auto-approve is enabled, auto-reply
          if (event.type === "permission.asked" && autoApproveRef.current) {
            const requestId = (event.properties as { id?: string }).id;
            if (requestId) {
              void apiReplyPermission(activeConversationId, requestId, "once");
              continue; // Don't dispatch to state — handled immediately
            }
          }

          dispatch({ type: "SSE_EVENT", event });
        }
      } catch {
        // Connection closed or aborted — expected when switching conversations
      }
    })();

    return () => {
      controller.abort();
    };
  }, [activeConversationId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sseAbortRef.current?.abort();
    };
  }, []);

  // --- Actions ---

  const sendUserPrompt = useCallback(
    (text: string, attachments?: SendConversationAttachmentInput[], _model?: string) => {
      if (!state.conversation) return;

      // Optimistic user message
      const optimisticMessage: ConversationMessage = {
        id: `optimistic-${Date.now()}`,
        conversationId: state.conversation.id,
        role: "user",
        content: text,
        parts: [{ id: `text-${Date.now()}`, type: "text", text }],
        attachments: (attachments ?? []).map((a) => ({
          type: a.type ?? "file",
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      dispatch({ type: "OPTIMISTIC_USER_MESSAGE", message: optimisticMessage });

      void sendPrompt(state.conversation.id, { text, attachments: attachments ?? [] }).catch(
        (err) => {
          console.error("Failed to send prompt:", err);
        },
      );
    },
    [state.conversation],
  );

  const sendShell = useCallback(
    (command: string) => {
      if (!state.conversation) return;
      void apiSendShell(state.conversation.id, command);
    },
    [state.conversation],
  );

  const sendCommand = useCallback(
    (command: string, args?: string) => {
      if (!state.conversation) return;
      void apiSendCommand(state.conversation.id, command, args);
    },
    [state.conversation],
  );

  const summarize = useCallback(() => {
    if (!state.conversation) return;
    void summarizeConversation(state.conversation.id);
  }, [state.conversation]);

  const abort = useCallback(() => {
    if (!state.conversation) return;
    void abortConversation(state.conversation.id);
  }, [state.conversation]);

  const startFresh = useCallback(() => {
    if (!agent) return;
    sseAbortRef.current?.abort();
    void startFreshConversation(agent.id).then((snapshot) => {
      dispatch({ type: "HYDRATE", snapshot });
    });
  }, [agent]);

  const switchConversation = useCallback(
    (targetId: string) => {
      if (!agent) return;
      sseAbortRef.current?.abort();
      void getConversation(agent.id, targetId).then((detail) => {
        dispatch({ type: "HYDRATE_DETAIL", detail });
      });
    },
    [agent],
  );

  const replyPerm = useCallback(
    (requestId: string, reply: "once" | "always" | "reject") => {
      if (!state.conversation) return;
      void apiReplyPermission(state.conversation.id, requestId, reply);
    },
    [state.conversation],
  );

  const replyQ = useCallback(
    (requestId: string, answers: string[][]) => {
      if (!state.conversation) return;
      void apiReplyQuestion(state.conversation.id, requestId, answers);
    },
    [state.conversation],
  );

  const rejectQ = useCallback(
    (requestId: string) => {
      if (!state.conversation) return;
      void apiRejectQuestion(state.conversation.id, requestId);
    },
    [state.conversation],
  );

  // --- Derived status ---

  let status: "loading" | "ready" | "error" = "loading";
  let error: string | null = null;

  if (agentQuery.error) {
    status = "error";
    error = agentQuery.error.message;
  } else if (snapshotQuery.error ?? specificQuery.error) {
    status = "error";
    error = (snapshotQuery.error ?? specificQuery.error)!.message;
  } else if (state.conversation) {
    status = "ready";
  }

  return {
    status,
    error,
    agent,
    agentStatus: state.agentStatus,
    conversation: state.conversation,
    parts: state.parts,
    previousConversations: state.previousConversations,
    pendingPermission: state.pendingPermissions[0] ?? null,
    pendingPermissionCount: state.pendingPermissions.length,
    pendingQuestion: state.pendingQuestion,
    todos: state.todos,
    autoApprove,
    setAutoApprove,
    sendUserPrompt,
    sendShell,
    sendCommand,
    summarize,
    abort,
    startFresh,
    switchConversation,
    replyPermission: replyPerm,
    replyQuestion: replyQ,
    rejectQuestion: rejectQ,
    ...(import.meta.env.DEV && {
      __injectEvent: (event: ChatEvent) => dispatch({ type: "SSE_EVENT", event }),
    }),
  };
}

function upsertPermissionRequest(
  requests: PermissionRequest[],
  nextRequest: PermissionRequest,
): PermissionRequest[] {
  const existingIndex = requests.findIndex((request) => request.id === nextRequest.id);

  if (existingIndex >= 0) {
    return requests.map((request, index) => (index === existingIndex ? nextRequest : request));
  }

  return [...requests, nextRequest].sort((left, right) => left.id.localeCompare(right.id));
}
