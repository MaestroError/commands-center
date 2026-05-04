import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import type {
  FileManagerFileContentKind,
  FileManagerFileContentResponse,
  FileManagerFileRevision,
  FileManagerRootKind,
} from "@cc/shared/schemas";

import {
  getFileManagerFileContent,
  FileSaveConflictError,
  saveFileManagerFileContent,
} from "@/lib/api";

const VALID_ROOTS: readonly FileManagerRootKind[] = ["workspace", "all-agents", "host-filesystem"];

export const MAX_OPEN_TABS = 30;
export const TABS_PARAM = "tabs";
export const ACTIVE_TAB_PARAM = "active";

export type EditorTabKey = string;

export type EditorTab = {
  key: EditorTabKey;
  root: FileManagerRootKind;
  path: string;
  name: string;
  loading: boolean;
  error?: string;
  kind?: FileManagerFileContentKind;
  mimeType?: string;
  absolutePath?: string;
  isWritable?: boolean;
  baseline?: string;
  draft?: string;
  binaryContentBase64?: string;
  revision?: FileManagerFileRevision;
  dirty: boolean;
};

type State = {
  tabs: EditorTab[];
  activeKey?: EditorTabKey;
};

type Action =
  | { type: "open"; root: FileManagerRootKind; path: string }
  | { type: "close"; key: EditorTabKey }
  | { type: "set-active"; key: EditorTabKey }
  | { type: "move"; from: number; to: number }
  | { type: "loading"; key: EditorTabKey }
  | {
      type: "loaded";
      key: EditorTabKey;
      response: FileManagerFileContentResponse;
    }
  | { type: "load-error"; key: EditorTabKey; error: string }
  | { type: "update-draft"; key: EditorTabKey; draft: string }
  | {
      type: "saved";
      key: EditorTabKey;
      revision: FileManagerFileRevision;
      content: string;
    }
  | { type: "seed"; tabs: EditorTab[]; activeKey?: EditorTabKey };

export function makeTabKey(root: FileManagerRootKind, path: string): EditorTabKey {
  return `${root}:${path}`;
}

export function parseTabKey(
  key: EditorTabKey,
): { root: FileManagerRootKind; path: string } | undefined {
  const sep = key.indexOf(":");
  if (sep <= 0) return undefined;
  const root = key.slice(0, sep) as FileManagerRootKind;
  const path = key.slice(sep + 1);
  if (!VALID_ROOTS.includes(root) || !path) return undefined;
  return { root, path };
}

function basenameOf(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const segments = trimmed.split("/");
  return segments[segments.length - 1] || trimmed || path;
}

function emptyTab(root: FileManagerRootKind, path: string): EditorTab {
  return {
    key: makeTabKey(root, path),
    root,
    path,
    name: basenameOf(path),
    loading: false,
    dirty: false,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "seed": {
      return { tabs: action.tabs, activeKey: action.activeKey };
    }
    case "open": {
      const key = makeTabKey(action.root, action.path);
      const existing = state.tabs.find((tab) => tab.key === key);
      if (existing) {
        return state.activeKey === key ? state : { ...state, activeKey: key };
      }
      if (state.tabs.length >= MAX_OPEN_TABS) {
        return state;
      }
      return {
        tabs: [...state.tabs, emptyTab(action.root, action.path)],
        activeKey: key,
      };
    }
    case "close": {
      const index = state.tabs.findIndex((tab) => tab.key === action.key);
      if (index === -1) return state;
      const nextTabs = state.tabs.filter((tab) => tab.key !== action.key);
      let nextActive = state.activeKey;
      if (state.activeKey === action.key) {
        const neighbor = state.tabs[index - 1] ?? state.tabs[index + 1];
        nextActive = neighbor?.key;
      }
      return { tabs: nextTabs, activeKey: nextActive };
    }
    case "set-active": {
      if (!state.tabs.some((tab) => tab.key === action.key)) return state;
      return state.activeKey === action.key ? state : { ...state, activeKey: action.key };
    }
    case "move": {
      const { from, to } = action;
      if (
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= state.tabs.length ||
        to >= state.tabs.length
      ) {
        return state;
      }
      const next = state.tabs.slice();
      const moved = next.splice(from, 1)[0];
      if (!moved) return state;
      next.splice(to, 0, moved);
      return { ...state, tabs: next };
    }
    case "loading": {
      return mapTab(state, action.key, (tab) => ({ ...tab, loading: true, error: undefined }));
    }
    case "loaded": {
      const { response } = action;
      return mapTab(state, action.key, (tab) => ({
        ...tab,
        loading: false,
        error: undefined,
        kind: response.kind,
        mimeType: response.mimeType,
        absolutePath: response.absolutePath,
        isWritable: response.isWritable,
        revision: response.revision,
        name: response.name || tab.name,
        baseline: response.kind === "text" ? response.content : undefined,
        draft: response.kind === "text" ? response.content : undefined,
        binaryContentBase64: response.kind === "binary" ? response.content : undefined,
        dirty: false,
      }));
    }
    case "load-error": {
      return mapTab(state, action.key, (tab) => ({ ...tab, loading: false, error: action.error }));
    }
    case "update-draft": {
      return mapTab(state, action.key, (tab) => {
        if (tab.kind !== "text") return tab;
        const draft = action.draft;
        return { ...tab, draft, dirty: draft !== (tab.baseline ?? "") };
      });
    }
    case "saved": {
      return mapTab(state, action.key, (tab) => ({
        ...tab,
        baseline: action.content,
        draft: action.content,
        revision: action.revision,
        dirty: false,
      }));
    }
    default:
      return state;
  }
}

function mapTab(state: State, key: EditorTabKey, updater: (tab: EditorTab) => EditorTab): State {
  let changed = false;
  const tabs = state.tabs.map((tab) => {
    if (tab.key !== key) return tab;
    const next = updater(tab);
    if (next !== tab) changed = true;
    return next;
  });
  return changed ? { ...state, tabs } : state;
}

export function serializeTabsParam(tabs: EditorTab[]): string {
  return tabs.map((tab) => `${tab.root}:${encodeURIComponent(tab.path)}`).join(",");
}

export function parseTabsParam(value: string | null): EditorTab[] {
  if (!value) return [];
  const seen = new Set<EditorTabKey>();
  const out: EditorTab[] = [];
  for (const raw of value.split(",")) {
    const sep = raw.indexOf(":");
    if (sep <= 0) continue;
    const root = raw.slice(0, sep) as FileManagerRootKind;
    if (!VALID_ROOTS.includes(root)) continue;
    let path: string;
    try {
      path = decodeURIComponent(raw.slice(sep + 1));
    } catch {
      continue;
    }
    if (!path) continue;
    const key = makeTabKey(root, path);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(emptyTab(root, path));
    if (out.length >= MAX_OPEN_TABS) break;
  }
  return out;
}

export type UseEditorTabs = {
  tabs: EditorTab[];
  activeKey?: EditorTabKey;
  activeTab?: EditorTab;
  open: (input: { root: FileManagerRootKind; path: string }) => void;
  close: (key: EditorTabKey) => void;
  setActive: (key: EditorTabKey) => void;
  move: (from: number, to: number) => void;
  updateDraft: (key: EditorTabKey, draft: string) => void;
  reload: (key: EditorTabKey) => Promise<void>;
  save: (
    key: EditorTabKey,
    options?: { overrideRevision?: FileManagerFileRevision },
  ) => Promise<{ ok: true } | { ok: false; conflict?: FileManagerFileRevision; error?: string }>;
  isAtCapacity: boolean;
};

export function useEditorTabs(): UseEditorTabs {
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    tabs: parseTabsParam(searchParams.get(TABS_PARAM)),
    activeKey: parseActiveParam(searchParams.get(ACTIVE_TAB_PARAM), searchParams.get(TABS_PARAM)),
  }));

  const stateRef = useRef(state);
  const routeSyncTargetRef = useRef<string>();
  stateRef.current = state;

  useEffect(() => {
    const routeTabs = parseTabsParam(searchParams.get(TABS_PARAM));
    const routeActive = parseActiveParam(
      searchParams.get(ACTIVE_TAB_PARAM),
      searchParams.get(TABS_PARAM),
    );
    const routeSerialized = serializeTabsParam(routeTabs);
    const stateSerialized = serializeTabsParam(stateRef.current.tabs);

    if (routeSerialized === stateSerialized && routeActive === stateRef.current.activeKey) {
      routeSyncTargetRef.current = undefined;
      return;
    }

    routeSyncTargetRef.current = buildEditorRouteSignature(routeSerialized, routeActive);

    dispatch({
      type: "seed",
      tabs: routeTabs.map(
        (routeTab) => stateRef.current.tabs.find((tab) => tab.key === routeTab.key) ?? routeTab,
      ),
      activeKey: routeActive,
    });
  }, [searchParams]);

  useEffect(() => {
    const currentSearch = searchParams.toString();
    const stateSerialized = serializeTabsParam(state.tabs);
    const stateActive =
      state.activeKey && state.tabs.some((tab) => tab.key === state.activeKey)
        ? state.activeKey
        : undefined;
    const routeSignature = routeSyncTargetRef.current;

    if (routeSignature) {
      const stateSignature = buildEditorRouteSignature(stateSerialized, stateActive);

      if (stateSignature !== routeSignature) {
        return;
      }

      routeSyncTargetRef.current = undefined;
    }

    const next = new URLSearchParams(searchParams);
    if (stateSerialized) {
      next.set(TABS_PARAM, stateSerialized);
    } else {
      next.delete(TABS_PARAM);
    }
    if (stateActive) {
      next.set(ACTIVE_TAB_PARAM, stateActive);
    } else {
      next.delete(ACTIVE_TAB_PARAM);
    }

    const nextSearch = next.toString();

    if (nextSearch !== currentSearch) {
      setSearchParams(next, { replace: true });
    }
  }, [state.tabs, state.activeKey, searchParams, setSearchParams]);

  const loadTab = useCallback(async (key: EditorTabKey) => {
    const target = stateRef.current.tabs.find((tab) => tab.key === key);
    if (!target) return;
    dispatch({ type: "loading", key });
    try {
      const response = await getFileManagerFileContent({ root: target.root, path: target.path });
      dispatch({ type: "loaded", key, response });
    } catch (error) {
      dispatch({
        type: "load-error",
        key,
        error: error instanceof Error ? error.message : "Failed to load file.",
      });
    }
  }, []);

  useEffect(() => {
    const active = state.tabs.find((tab) => tab.key === state.activeKey);
    if (!active) return;
    if (active.loading || active.error) return;
    if (active.kind !== undefined) return;
    void loadTab(active.key);
  }, [state.activeKey, state.tabs, loadTab]);

  const open = useCallback<UseEditorTabs["open"]>((input) => {
    dispatch({ type: "open", root: input.root, path: input.path });
  }, []);

  const close = useCallback<UseEditorTabs["close"]>((key) => {
    const target = stateRef.current.tabs.find((tab) => tab.key === key);
    if (!target) return;
    if (target.dirty) {
      const confirmed = window.confirm(`Discard unsaved changes to ${target.name}?`);
      if (!confirmed) return;
    }
    dispatch({ type: "close", key });
  }, []);

  const setActive = useCallback<UseEditorTabs["setActive"]>((key) => {
    dispatch({ type: "set-active", key });
  }, []);

  const move = useCallback<UseEditorTabs["move"]>((from, to) => {
    dispatch({ type: "move", from, to });
  }, []);

  const updateDraft = useCallback<UseEditorTabs["updateDraft"]>((key, draft) => {
    dispatch({ type: "update-draft", key, draft });
  }, []);

  const reload = useCallback<UseEditorTabs["reload"]>(
    async (key) => {
      await loadTab(key);
    },
    [loadTab],
  );

  const save = useCallback<UseEditorTabs["save"]>(async (key, options) => {
    const target = stateRef.current.tabs.find((tab) => tab.key === key);
    if (!target || target.kind !== "text" || !target.revision) {
      return { ok: false, error: "File is not ready to save." };
    }
    const draft = target.draft ?? "";
    try {
      const response = await saveFileManagerFileContent({
        root: target.root,
        path: target.path,
        content: draft,
        expectedRevision: options?.overrideRevision ?? target.revision,
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
    [state.tabs, state.activeKey],
  );

  return {
    tabs: state.tabs,
    activeKey: state.activeKey,
    activeTab,
    open,
    close,
    setActive,
    move,
    updateDraft,
    reload,
    save,
    isAtCapacity: state.tabs.length >= MAX_OPEN_TABS,
  };
}

function parseActiveParam(
  value: string | null,
  tabsValue: string | null,
): EditorTabKey | undefined {
  if (!value) return undefined;
  const tabs = parseTabsParam(tabsValue);
  return tabs.some((tab) => tab.key === value) ? value : undefined;
}

function buildEditorRouteSignature(serializedTabs: string, activeKey?: string): string {
  return `${serializedTabs}::${activeKey ?? ""}`;
}
