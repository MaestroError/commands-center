import { useCallback, useEffect, useMemo, useReducer } from "react";

import type { TerminalSession } from "@cc/shared/schemas";

import { closeTerminalSession, createTerminalSession, resizeTerminalSession } from "@/lib/api";

const GLOBAL_TERMINAL_STATE_KEY = "cc.global-terminal.v1";
const EMPTY_TERMINAL_SESSIONS: TerminalSession[] = [];

type PersistedTerminalState = {
  activeId?: string;
  sessionIds: string[];
};

function getTerminalBufferSnapshotKey(sessionId: string) {
  return `cc.global-terminal.buffer.${sessionId}`;
}

export type UseTerminalSessions = {
  sessions: TerminalSession[];
  activeId?: string;
  activeSession?: TerminalSession;
  create: (options?: { cwd?: string }) => Promise<void>;
  close: (id: string) => Promise<void>;
  remove: (id: string) => void;
  setActive: (id: string) => void;
  resize: (id: string, cols: number, rows: number) => Promise<void>;
  isLoading: boolean;
  error?: string;
};

type State = {
  sessions: TerminalSession[];
  activeId?: string;
  isLoading: boolean;
  error?: string;
};

type Action =
  | { type: "set-loading"; isLoading: boolean }
  | { type: "set-error"; error?: string }
  | { type: "add-session"; session: TerminalSession }
  | { type: "remove-session"; id: string }
  | { type: "set-active"; id: string }
  | { type: "seed"; sessions: TerminalSession[]; activeId?: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set-loading":
      return { ...state, isLoading: action.isLoading };
    case "set-error":
      return { ...state, error: action.error };
    case "add-session":
      return {
        ...state,
        sessions: [...state.sessions, action.session],
        activeId: action.session.id,
        isLoading: false,
      };
    case "remove-session": {
      const newSessions = state.sessions.filter((s) => s.id !== action.id);
      let newActiveId = state.activeId;
      if (state.activeId === action.id) {
        const idx = state.sessions.findIndex((s) => s.id === action.id);
        newActiveId = newSessions[idx]?.id ?? newSessions[idx - 1]?.id;
      }
      return { ...state, sessions: newSessions, activeId: newActiveId };
    }
    case "set-active":
      return { ...state, activeId: action.id };
    case "seed":
      return {
        ...state,
        sessions: action.sessions,
        activeId: action.activeId ?? action.sessions[0]?.id,
        isLoading: false,
      };
    default:
      return state;
  }
}

export function useTerminalSessions(
  initialSessions?: TerminalSession[],
  initialActiveId?: string,
): UseTerminalSessions {
  const sourceSessions = initialSessions ?? EMPTY_TERMINAL_SESSIONS;
  const persistedState = useMemo(() => readPersistedTerminalState(), []);
  const hydratedSessions = useMemo(
    () => hydratePersistedSessions(sourceSessions, persistedState),
    [persistedState, sourceSessions],
  );
  const hydratedActiveId =
    initialActiveId ?? selectPersistedActiveId(hydratedSessions, persistedState);
  const [state, dispatch] = useReducer(reducer, {
    sessions: hydratedSessions,
    activeId: hydratedActiveId,
    isLoading: false,
  });

  useEffect(() => {
    dispatch({
      type: "seed",
      sessions: hydratedSessions,
      activeId: hydratedActiveId,
    });
  }, [hydratedActiveId, hydratedSessions]);

  useEffect(() => {
    const persistedSessionIds = persistedState.sessionIds;
    writePersistedTerminalState({
      activeId: state.activeId,
      sessionIds: state.sessions.map((session) => session.id),
    });

    if (typeof window !== "undefined") {
      const activeSessionIds = new Set(state.sessions.map((session) => session.id));
      for (const id of persistedSessionIds) {
        if (!activeSessionIds.has(id)) {
          window.localStorage.removeItem(getTerminalBufferSnapshotKey(id));
        }
      }
    }
  }, [persistedState.sessionIds, state.activeId, state.sessions]);

  const create = useCallback(async (options?: { cwd?: string }) => {
    dispatch({ type: "set-loading", isLoading: true });
    dispatch({ type: "set-error", error: undefined });
    try {
      const session = await createTerminalSession({
        cwd: options?.cwd,
      });
      dispatch({ type: "add-session", session });
    } catch (err) {
      dispatch({
        type: "set-error",
        error: err instanceof Error ? err.message : "Failed to create session",
      });
      dispatch({ type: "set-loading", isLoading: false });
    }
  }, []);

  const close = useCallback(async (id: string) => {
    try {
      await closeTerminalSession(id);
      dispatch({ type: "remove-session", id });
    } catch (err) {
      dispatch({
        type: "set-error",
        error: err instanceof Error ? err.message : "Failed to close session",
      });
    }
  }, []);

  const remove = useCallback((id: string) => {
    dispatch({ type: "remove-session", id });
  }, []);

  const setActive = useCallback((id: string) => {
    dispatch({ type: "set-active", id });
  }, []);

  const resize = useCallback(async (id: string, cols: number, rows: number) => {
    try {
      await resizeTerminalSession(id, { cols, rows });
    } catch {
      // Resize errors should not interrupt terminal input; the session remains usable.
    }
  }, []);

  const activeSession = state.sessions.find((s) => s.id === state.activeId);

  return {
    sessions: state.sessions,
    activeId: state.activeId,
    activeSession,
    create,
    close,
    remove,
    setActive,
    resize,
    isLoading: state.isLoading,
    error: state.error,
  };
}

function readPersistedTerminalState(): PersistedTerminalState {
  if (typeof window === "undefined") {
    return { sessionIds: [] };
  }

  const raw = window.localStorage.getItem(GLOBAL_TERMINAL_STATE_KEY);
  if (!raw) {
    return { sessionIds: [] };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { sessionIds: [] };
    }

    const sessionIds = Array.isArray((parsed as { sessionIds?: unknown }).sessionIds)
      ? (parsed as { sessionIds: unknown[] }).sessionIds.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const activeId =
      typeof (parsed as { activeId?: unknown }).activeId === "string"
        ? (parsed as { activeId: string }).activeId
        : undefined;
    return { activeId, sessionIds };
  } catch {
    return { sessionIds: [] };
  }
}

function writePersistedTerminalState(state: PersistedTerminalState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(GLOBAL_TERMINAL_STATE_KEY, JSON.stringify(state));
}

function hydratePersistedSessions(
  sessions: TerminalSession[],
  persistedState: PersistedTerminalState,
): TerminalSession[] {
  const order = new Map(persistedState.sessionIds.map((id, index) => [id, index]));
  return [...sessions].sort((left, right) => {
    const leftIndex = order.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = order.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
    return right.createdAt - left.createdAt;
  });
}

function selectPersistedActiveId(
  sessions: TerminalSession[],
  persistedState: PersistedTerminalState,
): string | undefined {
  if (
    persistedState.activeId &&
    sessions.some((session) => session.id === persistedState.activeId)
  ) {
    return persistedState.activeId;
  }

  return sessions[0]?.id;
}
