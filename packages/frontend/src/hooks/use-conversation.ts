import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getActiveConversation,
  getConversation,
  getPendingInteractions,
  startFreshConversation,
  sendPrompt,
  sendShell as apiSendShell,
  sendCommand as apiSendCommand,
  summarizeConversation,
  abortConversation,
  cancelLiveRequest as apiCancelLiveRequest,
  replyPermission as apiReplyPermission,
  replyQuestion as apiReplyQuestion,
  resolveLiveRequest as apiResolveLiveRequest,
  rejectQuestion as apiRejectQuestion,
  connectConversationEvents,
} from "@/lib/api";
import { ApiRequestError } from "@/lib/api/client";
import { useSpecialistQuery } from "@/hooks/use-specialists-query";
import { queryKeys } from "@/lib/query-keys";
import type {
  Specialist,
  ChatEvent,
  ConversationDetail,
  ConversationMessage,
  ConversationPart,
  ConversationSummary,
  LiveRequest,
  PendingInteractions,
  SendConversationAttachmentInput,
  SessionStatus,
  TodoItem,
} from "@cc/shared/schemas";

// --- State ---

export type ToolLink = { messageID: string; callID: string };

export type PermissionRequest = {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
  tool?: ToolLink;
};

export type QuestionRequest = {
  id: string;
  sessionID: string;
  questions: Array<{
    question: string;
    header?: string;
    options: Array<{ label: string; description?: string }>;
    /** OpenCode's field name for "allow selecting multiple choices". */
    multiple?: boolean;
  }>;
  tool?: ToolLink;
};

/**
 * Parts are stored separately from messages, keyed by messageID.
 * This mirrors the OpenCode web app's approach: messages carry metadata,
 * parts carry content, and they're linked by messageID.
 */
export type ConversationState = {
  sessionStatus: SessionStatus;
  conversation: ConversationDetail | null;
  /** Parts keyed by messageID — populated by SSE events */
  parts: Record<string, ConversationPart[]>;
  previousConversations: ConversationSummary[];
  pendingPermissions: PermissionRequest[];
  pendingQuestion: QuestionRequest | null;
  queuedQuestions: QuestionRequest[];
  liveRequests: LiveRequest[];
  todos: TodoItem[];
  sendError: string | null;
};

export type Action =
  | { type: "HYDRATE"; snapshot: { current: ConversationDetail; previous: ConversationSummary[] } }
  | { type: "HYDRATE_DETAIL"; detail: ConversationDetail; previous?: ConversationSummary[] }
  | { type: "OPTIMISTIC_USER_MESSAGE"; message: ConversationMessage }
  | { type: "SEND_FAILED"; message: string }
  | { type: "CLEAR_SEND_ERROR" }
  | { type: "SSE_EVENT"; event: ChatEvent }
  | { type: "HYDRATE_PENDING"; pending: PendingInteractions }
  | { type: "DISCARD_STALE_PERMISSION"; requestId: string }
  | { type: "DISCARD_STALE_QUESTION"; requestId: string };

export const initialState: ConversationState = {
  sessionStatus: { type: "idle" },
  conversation: null,
  parts: {},
  previousConversations: [],
  pendingPermissions: [],
  pendingQuestion: null,
  queuedQuestions: [],
  liveRequests: [],
  todos: [],
  sendError: null,
};

const INITIAL_SSE_RECONNECT_DELAY_MS = 250;
const MAX_SSE_RECONNECT_DELAY_MS = 5_000;

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

/**
 * Pending interactions and todos are live backend state keyed by the
 * conversation — they are not carried in the conversation payload, so a
 * re-fetch of the SAME conversation must not drop them. Dropping them would
 * make an open review form or permission prompt vanish from the UI while the
 * specialist is still blocked on it, leaving a page reload as the only way to
 * get it back. Switching conversations does clear them: they belong to the one
 * being left.
 */
function liveInteractionState(
  state: ConversationState,
  nextConversationId: string,
): Pick<
  ConversationState,
  "pendingPermissions" | "pendingQuestion" | "queuedQuestions" | "liveRequests" | "todos"
> {
  if (state.conversation?.id !== nextConversationId) {
    return {
      pendingPermissions: [],
      pendingQuestion: null,
      queuedQuestions: [],
      liveRequests: [],
      todos: [],
    };
  }

  return {
    pendingPermissions: state.pendingPermissions,
    pendingQuestion: state.pendingQuestion,
    queuedQuestions: state.queuedQuestions,
    liveRequests: state.liveRequests,
    todos: state.todos,
  };
}

export function conversationReducer(state: ConversationState, action: Action): ConversationState {
  switch (action.type) {
    case "HYDRATE":
      return {
        ...state,
        conversation: action.snapshot.current,
        parts: buildPartsMap(action.snapshot.current.messages),
        previousConversations: action.snapshot.previous,
        sessionStatus: { type: "idle" },
        ...liveInteractionState(state, action.snapshot.current.id),
        sendError: null,
      };

    case "HYDRATE_DETAIL":
      return {
        ...state,
        conversation: action.detail,
        parts: buildPartsMap(action.detail.messages),
        previousConversations: action.previous ?? state.previousConversations,
        sessionStatus: { type: "idle" },
        ...liveInteractionState(state, action.detail.id),
        sendError: null,
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
        sendError: null,
      };
    }

    case "SEND_FAILED":
      return {
        ...state,
        sessionStatus: { type: "idle" },
        sendError: action.message,
      };

    case "CLEAR_SEND_ERROR":
      if (!state.sendError) {
        return state;
      }

      return {
        ...state,
        sendError: null,
      };

    case "SSE_EVENT":
      return applySseEvent(state, action.event);

    case "HYDRATE_PENDING": {
      // Merge (union by id) rather than replace. The pending-interactions fetch
      // is async and runs alongside the SSE stream, so a live event can add a
      // NEWER interaction before the fetch resolves; a wholesale replace with
      // the (older) fetched snapshot would drop it and strand the prompt. On a
      // fresh conversation open local pending state is empty, so this reduces to
      // "adopt the fetched snapshot"; mid-session it only ever adds what was
      // missed. Removals still arrive via the *.replied / *.cancelled events.
      let pendingPermissions = state.pendingPermissions;
      for (const permission of action.pending.permissions) {
        pendingPermissions = upsertPermissionRequest(pendingPermissions, permission);
      }

      let liveRequests = state.liveRequests;
      for (const request of action.pending.liveRequests) {
        liveRequests = upsertLiveRequest(liveRequests, request);
      }

      let pendingQuestion = state.pendingQuestion;
      let queuedQuestions = state.queuedQuestions;
      const hydratedQuestions =
        action.pending.questions ?? (action.pending.question ? [action.pending.question] : []);
      for (const question of hydratedQuestions) {
        if (!pendingQuestion) {
          pendingQuestion = question;
        } else if (pendingQuestion.id !== question.id) {
          queuedQuestions = upsertQuestionRequest(queuedQuestions, question);
        }
      }

      return {
        ...state,
        pendingPermissions,
        pendingQuestion,
        queuedQuestions,
        liveRequests,
      };
    }

    case "DISCARD_STALE_PERMISSION":
      return {
        ...state,
        pendingPermissions: state.pendingPermissions.filter(
          (request) => request.id !== action.requestId,
        ),
      };

    case "DISCARD_STALE_QUESTION":
      if (state.pendingQuestion?.id === action.requestId) {
        return {
          ...state,
          pendingQuestion: state.queuedQuestions[0] ?? null,
          queuedQuestions: state.queuedQuestions.slice(1),
        };
      }
      return {
        ...state,
        queuedQuestions: state.queuedQuestions.filter(
          (question) => question.id !== action.requestId,
        ),
      };

    default:
      return state;
  }
}

function applySseEvent(state: ConversationState, event: ChatEvent): ConversationState {
  switch (event.type) {
    case "session.status":
      return { ...state, sessionStatus: event.properties.status };

    case "session.error":
      return {
        ...state,
        sessionStatus: { type: "idle" },
        sendError: event.properties.error.message,
      };

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
      if (!state.pendingQuestion) {
        return {
          ...state,
          pendingQuestion: event.properties as unknown as QuestionRequest,
        };
      }
      if (state.pendingQuestion.id === event.properties.id) {
        return {
          ...state,
          pendingQuestion: event.properties as unknown as QuestionRequest,
        };
      }
      return {
        ...state,
        queuedQuestions: upsertQuestionRequest(
          state.queuedQuestions,
          event.properties as unknown as QuestionRequest,
        ),
      };

    case "question.replied":
    case "question.rejected":
      return conversationReducer(state, {
        type: "DISCARD_STALE_QUESTION",
        requestId: event.properties.requestID,
      });

    case "todo.updated":
      return { ...state, todos: event.properties.todos };

    case "cc.live_request.opened":
      return {
        ...state,
        liveRequests: upsertLiveRequest(state.liveRequests, event.properties.request),
      };

    case "cc.live_request.resolved":
    case "cc.live_request.cancelled":
      return {
        ...state,
        liveRequests: state.liveRequests.filter(
          (request) => request.id !== event.properties.requestId,
        ),
      };

    default:
      return state;
  }
}

// --- Hook ---

export type UseConversationReturn = {
  status: "loading" | "ready" | "error";
  error: string | null;
  agent: Specialist | null;
  agentStatus: "idle" | "busy" | "retry";
  sessionStatus: SessionStatus;
  sendError: string | null;
  conversation: ConversationDetail | null;
  /** Parts keyed by messageID — use this to render message content */
  parts: Record<string, ConversationPart[]>;
  previousConversations: ConversationSummary[];
  pendingPermission: PermissionRequest | null;
  pendingPermissionCount: number;
  /** All pending permissions, not just the head of the queue — used to link tool rows to their pending request. */
  pendingPermissions: PermissionRequest[];
  pendingQuestion: QuestionRequest | null;
  liveRequests: LiveRequest[];
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
  resolveLiveRequest: (
    requestId: string,
    action: string,
    values: Record<string, string>,
  ) => Promise<void>;
  cancelLiveRequest: (requestId: string, reason?: string) => Promise<void>;
  clearSendError: () => void;
  /** Dev-only: inject a mock SSE event into the reducer */
  __injectEvent?: (event: ChatEvent) => void;
};

export function useConversation(agentSlug: string, conversationId?: string): UseConversationReturn {
  const [state, dispatch] = useReducer(conversationReducer, initialState);
  const sseAbortRef = useRef<AbortController | null>(null);

  // Auto-approve state with localStorage persistence
  const [autoApprove, setAutoApproveState] = useState(() => {
    try {
      return localStorage.getItem(`cc-specialist-auto-approve-${agentSlug}`) === "true";
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
        localStorage.setItem(`cc-specialist-auto-approve-${agentSlug}`, enabled ? "true" : "false");
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
  const agentQuery = useSpecialistQuery(agentSlug);
  const agent = agentQuery.data ?? null;

  // 2. Fetch active conversation once we have the specialist
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
  const activeAgentId = agent?.id;

  useEffect(() => {
    if (!activeConversationId || !activeAgentId) return;

    sseAbortRef.current?.abort();

    const controller = new AbortController();
    sseAbortRef.current = controller;

    const hydratePendingInteractions = (pending: PendingInteractions): void => {
      if (controller.signal.aborted) return;

      const permissionsToSurface: typeof pending.permissions = [];
      if (autoApproveRef.current) {
        for (const permission of pending.permissions) {
          void apiReplyPermission(activeConversationId, permission.id, "once").catch((error) => {
            if (controller.signal.aborted) return;
            if (isStaleRequestError(error)) return;
            dispatch({
              type: "SSE_EVENT",
              event: { type: "permission.asked", properties: permission },
            });
          });
        }
      } else {
        permissionsToSurface.push(...pending.permissions);
      }

      dispatch({
        type: "HYDRATE_PENDING",
        pending: { ...pending, permissions: permissionsToSurface },
      });
    };

    void (async () => {
      void getPendingInteractions(activeConversationId)
        .then(hydratePendingInteractions)
        .catch(() => {
          // The live stream remains the fallback for interactions raised after this point.
        });

      let connectionAttempt = 0;
      let reconnectDelay = INITIAL_SSE_RECONNECT_DELAY_MS;

      while (!controller.signal.aborted) {
        connectionAttempt += 1;

        try {
          let connectionReady = false;

          for await (const event of connectConversationEvents(
            activeConversationId,
            controller.signal,
          )) {
            if (controller.signal.aborted) return;

            if (event.type === "connected") {
              if (connectionReady) continue;
              connectionReady = true;
              reconnectDelay = INITIAL_SSE_RECONNECT_DELAY_MS;

              if (connectionAttempt > 1) {
                try {
                  const [detail, pending] = await Promise.all([
                    getConversation(activeAgentId, activeConversationId),
                    getPendingInteractions(activeConversationId),
                  ]);

                  if (controller.signal.aborted) return;
                  dispatch({ type: "HYDRATE_DETAIL", detail });
                  hydratePendingInteractions(pending);
                } catch {
                  if (controller.signal.aborted) return;
                }
              }

              continue;
            }

            if (event.type === "permission.asked" && autoApproveRef.current) {
              const requestId = (event.properties as { id?: string }).id;
              if (requestId) {
                void apiReplyPermission(activeConversationId, requestId, "once").catch((error) => {
                  if (controller.signal.aborted) return;
                  if (isStaleRequestError(error)) return;
                  dispatch({ type: "SSE_EVENT", event });
                });
                continue;
              }
            }

            dispatch({ type: "SSE_EVENT", event });
          }
        } catch {
          if (controller.signal.aborted) return;
        }

        await waitForAbortableDelay(reconnectDelay, controller.signal);
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_SSE_RECONNECT_DELAY_MS);
      }
    })();

    return () => {
      controller.abort();
      if (sseAbortRef.current === controller) {
        sseAbortRef.current = null;
      }
    };
  }, [activeAgentId, activeConversationId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sseAbortRef.current?.abort();
    };
  }, []);

  // --- Actions ---

  const sendUserPrompt = useCallback(
    (text: string, attachments?: SendConversationAttachmentInput[], model?: string) => {
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

      void sendPrompt(state.conversation.id, { text, attachments: attachments ?? [], model }).catch(
        (err) => {
          dispatch({
            type: "SEND_FAILED",
            message: err instanceof Error && err.message ? err.message : "Failed to send prompt.",
          });
        },
      );
    },
    [state.conversation],
  );

  const clearSendError = useCallback(() => {
    dispatch({ type: "CLEAR_SEND_ERROR" });
  }, []);

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
      void apiReplyPermission(state.conversation.id, requestId, reply).catch((error: unknown) => {
        // The permission was already resolved or timed out server-side —
        // drop it locally so the dock can't wedge on a dead prompt.
        if (isStaleRequestError(error)) {
          dispatch({ type: "DISCARD_STALE_PERMISSION", requestId });
        }
      });
    },
    [state.conversation],
  );

  const replyQ = useCallback(
    (requestId: string, answers: string[][]) => {
      if (!state.conversation) return;
      const conversationId = state.conversation.id;
      void apiReplyQuestion(conversationId, requestId, answers)
        .then(() => {
          dispatch({ type: "DISCARD_STALE_QUESTION", requestId });
        })
        .catch((error: unknown) => {
          if (isStaleRequestError(error)) {
            dispatch({ type: "DISCARD_STALE_QUESTION", requestId });
          }
        });
    },
    [state.conversation],
  );

  const rejectQ = useCallback(
    (requestId: string) => {
      if (!state.conversation) return;
      const conversationId = state.conversation.id;
      void apiRejectQuestion(conversationId, requestId)
        .then(() => {
          dispatch({ type: "DISCARD_STALE_QUESTION", requestId });
        })
        .catch((error: unknown) => {
          if (isStaleRequestError(error)) {
            dispatch({ type: "DISCARD_STALE_QUESTION", requestId });
          }
        });
    },
    [state.conversation],
  );

  const resolveLive = useCallback(
    async (requestId: string, action: string, values: Record<string, string>) => {
      if (!state.conversation) return;
      await apiResolveLiveRequest(state.conversation.id, requestId, { action, values });
    },
    [state.conversation],
  );

  const cancelLive = useCallback(
    async (requestId: string, reason?: string) => {
      if (!state.conversation) return;
      await apiCancelLiveRequest(state.conversation.id, requestId, { reason });
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
    agentStatus: state.sessionStatus.type,
    sessionStatus: state.sessionStatus,
    sendError: state.sendError,
    conversation: state.conversation,
    parts: state.parts,
    previousConversations: state.previousConversations,
    pendingPermission: state.pendingPermissions[0] ?? null,
    pendingPermissionCount: state.pendingPermissions.length,
    pendingPermissions: state.pendingPermissions,
    pendingQuestion: state.pendingQuestion,
    liveRequests: state.liveRequests,
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
    resolveLiveRequest: resolveLive,
    cancelLiveRequest: cancelLive,
    clearSendError,
    ...(import.meta.env.DEV && {
      __injectEvent: (event: ChatEvent) => dispatch({ type: "SSE_EVENT", event }),
    }),
  };
}

function upsertLiveRequest(requests: LiveRequest[], nextRequest: LiveRequest): LiveRequest[] {
  const existingIndex = requests.findIndex((request) => request.id === nextRequest.id);

  if (existingIndex >= 0) {
    return requests.map((request, index) => (index === existingIndex ? nextRequest : request));
  }

  return [...requests, nextRequest];
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

function upsertQuestionRequest(
  requests: QuestionRequest[],
  nextRequest: QuestionRequest,
): QuestionRequest[] {
  const existingIndex = requests.findIndex((request) => request.id === nextRequest.id);

  if (existingIndex >= 0) {
    return requests.map((request, index) => (index === existingIndex ? nextRequest : request));
  }

  return [...requests, nextRequest];
}

// A permission/question reply targeting an id the backend no longer knows
// about (already resolved, or timed out) comes back as a 404. Treat that as
// "this prompt is gone" rather than a transient failure the user should retry.
function isStaleRequestError(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 404 || error.status === 410);
}

function waitForAbortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(finish, delayMs);

    signal.addEventListener("abort", finish, { once: true });

    function finish(): void {
      clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve();
    }
  });
}
