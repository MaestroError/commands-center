import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import type {
  FileManagerFileContentResponse,
  FileManagerFileRevision,
  FileManagerRootKind,
  LiveRequest,
  SessionMediaItem,
} from "@cc/shared/schemas";

import {
  FileSaveConflictError,
  getFileManagerFileContent,
  saveFileManagerFileContent,
} from "@/lib/api";
import type { WorkspaceFileSurfaceFile } from "@/components/workspace/WorkspaceFileSurface";

const STORAGE_KEY_PREFIX = "cc.chat-inspector";
const MAX_OPEN_TABS = 20;

type FileTab = WorkspaceFileSurfaceFile & {
  tabType: "file";
  key: string;
  root: FileManagerRootKind;
};

type MediaTab = {
  tabType: "media";
  key: string;
  name: string;
  dirty: false;
  item: SessionMediaItem;
};

type LiveRequestTab = {
  tabType: "live-request";
  key: string;
  name: string;
  dirty: false;
  closable: boolean;
  request: LiveRequest;
};

export type ChatInspectionTab = FileTab | MediaTab | LiveRequestTab;

type State = {
  tabs: ChatInspectionTab[];
  activeKey?: string;
  open: boolean;
};

type StoredState = {
  tabs: Array<
    | { tabType: "file"; root: FileManagerRootKind; path: string; displayPath?: string }
    | { tabType: "media"; item: SessionMediaItem }
    | { tabType: "live-request"; request: LiveRequest }
  >;
  activeKey?: string;
  open: boolean;
};

type Action =
  | { type: "seed"; state: State }
  | { type: "set-open"; open: boolean }
  | { type: "open-file"; root: FileManagerRootKind; path: string; displayPath?: string }
  | { type: "open-media"; item: SessionMediaItem }
  | { type: "open-live-request"; request: LiveRequest }
  | { type: "remove-live-request"; requestId: string }
  | { type: "set-active"; key: string }
  | { type: "close"; key: string }
  | { type: "loading"; key: string }
  | { type: "loaded"; key: string; response: FileManagerFileContentResponse; displayPath?: string }
  | { type: "load-error"; key: string; error: string }
  | { type: "update-draft"; key: string; draft: string }
  | { type: "saved"; key: string; revision: FileManagerFileRevision; content: string };

export type UseChatInspectionTabs = {
  tabs: ChatInspectionTab[];
  activeKey?: string;
  activeTab?: ChatInspectionTab;
  open: boolean;
  openFile: (input: { root: FileManagerRootKind; path: string; displayPath?: string }) => void;
  openMedia: (item: SessionMediaItem) => void;
  openLiveRequest: (request: LiveRequest) => void;
  removeLiveRequest: (requestId: string) => void;
  close: (key: string) => void;
  setActive: (key: string) => void;
  setOpen: (open: boolean) => void;
  updateDraft: (key: string, draft: string) => void;
  reload: (key: string) => Promise<void>;
  save: (
    key: string,
    options?: { overrideRevision?: FileManagerFileRevision },
  ) => Promise<{ ok: true } | { ok: false; conflict?: FileManagerFileRevision; error?: string }>;
};

export function useChatInspectionTabs(conversationId?: string): UseChatInspectionTabs {
  const [state, dispatch] = useReducer(reducer, conversationId, createInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    dispatch({ type: "seed", state: createInitialState(conversationId) });
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        storageKey(conversationId),
        JSON.stringify(toStoredState(state)),
      );
    } catch {
      // Ignore storage failures.
    }
  }, [conversationId, state]);

  const loadFileTab = useCallback(async (key: string) => {
    const tab = stateRef.current.tabs.find((item) => item.key === key);

    if (!tab || tab.tabType !== "file") {
      return;
    }

    dispatch({ type: "loading", key });

    try {
      const response = await getFileManagerFileContent({ root: tab.root, path: tab.path });
      dispatch({
        type: "loaded",
        key,
        response,
        displayPath: tab.displayPath,
      });
    } catch (error) {
      dispatch({
        type: "load-error",
        key,
        error: error instanceof Error ? error.message : "Failed to load file.",
      });
    }
  }, []);

  useEffect(() => {
    const activeTab = state.tabs.find((tab) => tab.key === state.activeKey);

    if (!activeTab || activeTab.tabType !== "file") {
      return;
    }

    if (activeTab.loading || activeTab.kind !== undefined || activeTab.error) {
      return;
    }

    void loadFileTab(activeTab.key);
  }, [loadFileTab, state.activeKey, state.tabs]);

  const openFile = useCallback<UseChatInspectionTabs["openFile"]>((input) => {
    dispatch({ ...input, type: "open-file" });
  }, []);

  const openMedia = useCallback<UseChatInspectionTabs["openMedia"]>((item) => {
    dispatch({ type: "open-media", item });
  }, []);

  const openLiveRequest = useCallback<UseChatInspectionTabs["openLiveRequest"]>((request) => {
    dispatch({ type: "open-live-request", request });
  }, []);

  const removeLiveRequest = useCallback<UseChatInspectionTabs["removeLiveRequest"]>((requestId) => {
    dispatch({ type: "remove-live-request", requestId });
  }, []);

  const close = useCallback<UseChatInspectionTabs["close"]>((key) => {
    const tab = stateRef.current.tabs.find((item) => item.key === key);

    if (!tab) {
      return;
    }

    if (tab.tabType === "live-request" && !tab.closable) {
      return;
    }

    if (tab.tabType === "file" && tab.dirty) {
      const confirmed = window.confirm(`Discard unsaved changes to ${tab.name}?`);

      if (!confirmed) {
        return;
      }
    }

    dispatch({ type: "close", key });
  }, []);

  const setActive = useCallback<UseChatInspectionTabs["setActive"]>((key) => {
    dispatch({ type: "set-active", key });
  }, []);

  const setOpen = useCallback<UseChatInspectionTabs["setOpen"]>((open) => {
    dispatch({ type: "set-open", open });
  }, []);

  const updateDraft = useCallback<UseChatInspectionTabs["updateDraft"]>((key, draft) => {
    dispatch({ type: "update-draft", key, draft });
  }, []);

  const reload = useCallback<UseChatInspectionTabs["reload"]>(
    async (key) => {
      await loadFileTab(key);
    },
    [loadFileTab],
  );

  const save = useCallback<UseChatInspectionTabs["save"]>(async (key, options) => {
    const tab = stateRef.current.tabs.find((item) => item.key === key);

    if (!tab || tab.tabType !== "file" || tab.kind !== "text" || !tab.revision) {
      return { ok: false, error: "File is not ready to save." };
    }

    const draft = tab.draft ?? "";

    try {
      const response = await saveFileManagerFileContent({
        root: tab.root,
        path: tab.path,
        content: draft,
        expectedRevision: options?.overrideRevision ?? tab.revision,
      });

      dispatch({ type: "saved", key, revision: response.revision, content: draft });
      return { ok: true };
    } catch (error) {
      if (error instanceof FileSaveConflictError) {
        return { ok: false, conflict: error.currentRevision };
      }

      return {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save file.",
      };
    }
  }, []);

  const activeTab = useMemo(
    () => state.tabs.find((tab) => tab.key === state.activeKey),
    [state.activeKey, state.tabs],
  );

  return {
    tabs: state.tabs,
    activeKey: state.activeKey,
    activeTab,
    open: state.open && state.tabs.length > 0,
    openFile,
    openMedia,
    openLiveRequest,
    removeLiveRequest,
    close,
    setActive,
    setOpen,
    updateDraft,
    reload,
    save,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "seed":
      return action.state;

    case "set-open":
      return { ...state, open: action.open && state.tabs.length > 0 };

    case "open-file": {
      const key = makeFileTabKey(action.root, action.path);
      const existing = state.tabs.find((tab) => tab.key === key);

      if (existing) {
        return { ...state, activeKey: key, open: true };
      }

      if (state.tabs.length >= MAX_OPEN_TABS) {
        return { ...state, open: true };
      }

      return {
        tabs: [...state.tabs, createEmptyFileTab(action.root, action.path, action.displayPath)],
        activeKey: key,
        open: true,
      };
    }

    case "open-media": {
      const key = makeMediaTabKey(action.item.id);
      const existing = state.tabs.find((tab) => tab.key === key);

      if (existing) {
        return { ...state, activeKey: key, open: true };
      }

      if (state.tabs.length >= MAX_OPEN_TABS) {
        return { ...state, open: true };
      }

      return {
        tabs: [...state.tabs, createMediaTab(action.item)],
        activeKey: key,
        open: true,
      };
    }

    case "open-live-request": {
      const key = makeLiveRequestTabKey(action.request.id);
      const existing = state.tabs.find((tab) => tab.key === key);

      if (existing) {
        // A live request's content is immutable for a given id, so re-opening
        // one that's already present is a no-op. Returning the SAME state
        // reference is essential, not just an optimization: WorkspaceChatPage's
        // live-request sync effect calls this on every render, and emitting a
        // fresh state object here would spin an infinite render loop
        // (new state → re-render → effect → dispatch → new state → ...).
        return state;
      }

      if (state.tabs.length >= MAX_OPEN_TABS) {
        return state.open ? state : { ...state, open: true };
      }

      return {
        tabs: [...state.tabs, createLiveRequestTab(action.request)],
        activeKey: key,
        open: true,
      };
    }

    case "remove-live-request":
      return closeTab(state, makeLiveRequestTabKey(action.requestId));

    case "set-active":
      return state.tabs.some((tab) => tab.key === action.key)
        ? { ...state, activeKey: action.key }
        : state;

    case "close": {
      return closeTab(state, action.key);
    }

    case "loading":
      return mapFileTab(state, action.key, (tab) => ({ ...tab, loading: true, error: undefined }));

    case "loaded":
      return mapFileTab(state, action.key, (tab) => ({
        ...tab,
        loading: false,
        error: undefined,
        name: action.response.name || tab.name,
        path: action.response.path,
        displayPath: action.displayPath,
        kind: action.response.kind,
        mimeType: action.response.mimeType,
        isWritable: action.response.isWritable,
        revision: action.response.revision,
        baseline: action.response.kind === "text" ? action.response.content : undefined,
        draft: action.response.kind === "text" ? action.response.content : undefined,
        binaryContentBase64:
          action.response.kind === "binary" ? action.response.content : undefined,
        dirty: false,
      }));

    case "load-error":
      return mapFileTab(state, action.key, (tab) => ({
        ...tab,
        loading: false,
        error: action.error,
      }));

    case "update-draft":
      return mapFileTab(state, action.key, (tab) => {
        if (tab.kind !== "text") {
          return tab;
        }

        return {
          ...tab,
          draft: action.draft,
          dirty: action.draft !== (tab.baseline ?? ""),
        };
      });

    case "saved":
      return mapFileTab(state, action.key, (tab) => ({
        ...tab,
        baseline: action.content,
        draft: action.content,
        revision: action.revision,
        dirty: false,
      }));

    default:
      return state;
  }
}

function closeTab(state: State, key: string): State {
  const index = state.tabs.findIndex((tab) => tab.key === key);

  if (index === -1) {
    return state;
  }

  const nextTabs = state.tabs.filter((tab) => tab.key !== key);
  const nextActive =
    state.activeKey === key
      ? (state.tabs[index - 1] ?? state.tabs[index + 1])?.key
      : state.activeKey;

  return {
    tabs: nextTabs,
    activeKey: nextActive,
    open: nextTabs.length > 0 && state.open,
  };
}

function createInitialState(conversationId?: string): State {
  if (!conversationId) {
    return { tabs: [], activeKey: undefined, open: false };
  }

  try {
    const raw = window.sessionStorage.getItem(storageKey(conversationId));

    if (!raw) {
      return { tabs: [], activeKey: undefined, open: false };
    }

    const parsed = JSON.parse(raw) as Partial<StoredState>;
    const tabs: ChatInspectionTab[] = [];

    for (const tab of parsed.tabs ?? []) {
      if (tab && typeof tab === "object" && tab.tabType === "file") {
        tabs.push(createEmptyFileTab(tab.root, tab.path, tab.displayPath));
        continue;
      }

      if (tab && typeof tab === "object" && tab.tabType === "media") {
        tabs.push(createMediaTab(tab.item));
      }

      // Live-request tabs are intentionally NOT restored from storage: they're
      // ephemeral backend state, re-derived on load from the pending-interactions
      // rehydration (conv.liveRequests → the WorkspaceChatPage sync effect).
      // Restoring them here would race that effect and could resurrect a
      // stale/already-resolved request.
    }
    const activeKey =
      typeof parsed.activeKey === "string" && tabs.some((tab) => tab.key === parsed.activeKey)
        ? parsed.activeKey
        : tabs[0]?.key;

    return {
      tabs,
      activeKey,
      open: parsed.open === true && tabs.length > 0,
    };
  } catch {
    return { tabs: [], activeKey: undefined, open: false };
  }
}

function createEmptyFileTab(
  root: FileManagerRootKind,
  path: string,
  displayPath?: string,
): FileTab {
  return {
    tabType: "file",
    key: makeFileTabKey(root, path),
    root,
    path,
    displayPath,
    name: basenameOf(displayPath ?? path),
    loading: false,
    dirty: false,
  };
}

function createMediaTab(item: SessionMediaItem): MediaTab {
  return {
    tabType: "media",
    key: makeMediaTabKey(item.id),
    name: item.filename ?? "Untitled",
    dirty: false,
    item,
  };
}

function createLiveRequestTab(request: LiveRequest): LiveRequestTab {
  return {
    tabType: "live-request",
    key: makeLiveRequestTabKey(request.id),
    name: request.presentation.title,
    dirty: false,
    closable: request.closable,
    request,
  };
}

function mapFileTab(state: State, key: string, update: (tab: FileTab) => FileTab): State {
  let changed = false;
  const tabs = state.tabs.map((tab) => {
    if (tab.key !== key || tab.tabType !== "file") {
      return tab;
    }

    const next = update(tab);

    if (next !== tab) {
      changed = true;
    }

    return next;
  });

  return changed ? { ...state, tabs } : state;
}

function toStoredState(state: State): StoredState {
  const storedTabs: StoredState["tabs"] = [];

  for (const tab of state.tabs) {
    if (tab.tabType === "file") {
      storedTabs.push({
        tabType: "file",
        root: tab.root,
        path: tab.path,
        displayPath: tab.displayPath,
      });
    } else if (tab.tabType === "media") {
      storedTabs.push({ tabType: "media", item: tab.item });
    }
    // Live-request tabs are not persisted — see createInitialState. They're
    // re-derived from the backend on load, so persisting them would only risk
    // resurrecting a stale request.
  }

  const activeKey =
    state.activeKey && storedTabs.some((tab) => tabStorageKey(tab) === state.activeKey)
      ? state.activeKey
      : undefined;

  return {
    tabs: storedTabs,
    activeKey,
    open: state.open && storedTabs.length > 0,
  };
}

function tabStorageKey(tab: StoredState["tabs"][number]): string {
  if (tab.tabType === "file") {
    return makeFileTabKey(tab.root, tab.path);
  }
  if (tab.tabType === "media") {
    return makeMediaTabKey(tab.item.id);
  }
  return makeLiveRequestTabKey(tab.request.id);
}

function storageKey(conversationId: string): string {
  return `${STORAGE_KEY_PREFIX}:${conversationId}`;
}

function basenameOf(path: string): string {
  const trimmed = path.replace(/\/+$/u, "");
  const segments = trimmed.split("/");
  return segments.at(-1) || trimmed || path;
}

function makeFileTabKey(root: FileManagerRootKind, path: string): string {
  return `file:${root}:${path}`;
}

function makeMediaTabKey(id: string): string {
  return `media:${id}`;
}

function makeLiveRequestTabKey(id: string): string {
  return `live-request:${id}`;
}
