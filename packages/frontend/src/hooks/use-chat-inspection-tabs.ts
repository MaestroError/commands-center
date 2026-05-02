import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import type {
  FileManagerFileContentResponse,
  FileManagerFileRevision,
  FileManagerRootKind,
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

export type ChatInspectionTab = FileTab | MediaTab;

type State = {
  tabs: ChatInspectionTab[];
  activeKey?: string;
  open: boolean;
};

type StoredState = {
  tabs: Array<
    | { tabType: "file"; root: FileManagerRootKind; path: string; displayPath?: string }
    | { tabType: "media"; item: SessionMediaItem }
  >;
  activeKey?: string;
  open: boolean;
};

type Action =
  | { type: "seed"; state: State }
  | { type: "set-open"; open: boolean }
  | { type: "open-file"; root: FileManagerRootKind; path: string; displayPath?: string }
  | { type: "open-media"; item: SessionMediaItem }
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

  const close = useCallback<UseChatInspectionTabs["close"]>((key) => {
    const tab = stateRef.current.tabs.find((item) => item.key === key);

    if (!tab) {
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

    case "set-active":
      return state.tabs.some((tab) => tab.key === action.key)
        ? { ...state, activeKey: action.key }
        : state;

    case "close": {
      const index = state.tabs.findIndex((tab) => tab.key === action.key);

      if (index === -1) {
        return state;
      }

      const nextTabs = state.tabs.filter((tab) => tab.key !== action.key);
      const nextActive =
        state.activeKey === action.key
          ? (state.tabs[index - 1] ?? state.tabs[index + 1])?.key
          : state.activeKey;

      return {
        tabs: nextTabs,
        activeKey: nextActive,
        open: nextTabs.length > 0 && state.open,
      };
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
  return {
    tabs: state.tabs.map((tab) =>
      tab.tabType === "file"
        ? {
            tabType: "file",
            root: tab.root,
            path: tab.path,
            displayPath: tab.displayPath,
          }
        : {
            tabType: "media",
            item: tab.item,
          },
    ),
    activeKey: state.activeKey,
    open: state.open,
  };
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
