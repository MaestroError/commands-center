import { useCallback, useRef, useState } from "react";

import type {
  FileManagerFileContentResponse,
  FileManagerFileRevision,
  FileManagerRootKind,
} from "@cc/shared/schemas";

import {
  FileSaveConflictError,
  getFileManagerFileContent,
  saveFileManagerFileContent,
} from "@/lib/api";

import type { WorkspaceFileSurfaceFile } from "@/components/workspace/WorkspaceFileSurface";

type QuickFileInput = {
  root: FileManagerRootKind;
  path: string;
  displayPath?: string;
};

type QuickFileState = WorkspaceFileSurfaceFile & {
  root: FileManagerRootKind;
};

export type UseQuickFile = {
  file?: QuickFileState;
  busy: boolean;
  conflict?: { currentRevision?: FileManagerFileRevision; message: string };
  errorMessage?: string;
  open: (input: QuickFileInput) => Promise<void>;
  close: () => boolean;
  updateDraft: (draft: string) => void;
  reload: () => Promise<void>;
  save: (overrideRevision?: FileManagerFileRevision) => Promise<void>;
};

export function useQuickFile(): UseQuickFile {
  const [file, setFile] = useState<QuickFileState>();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [conflict, setConflict] = useState<{
    currentRevision?: FileManagerFileRevision;
    message: string;
  }>();
  const requestIdRef = useRef(0);

  const load = useCallback(async (input: QuickFileInput) => {
    const requestId = ++requestIdRef.current;

    setBusy(false);
    setErrorMessage(undefined);
    setConflict(undefined);
    setFile({
      root: input.root,
      path: input.path,
      displayPath: input.displayPath,
      name: basenameOf(input.path),
      loading: true,
      dirty: false,
    });

    try {
      const response = await getFileManagerFileContent(input);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setFile(mapResponseToState(input, response));
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setFile({
        root: input.root,
        path: input.path,
        displayPath: input.displayPath,
        name: basenameOf(input.path),
        loading: false,
        dirty: false,
        error: error instanceof Error ? error.message : "Failed to load file.",
      });
    }
  }, []);

  const open = useCallback(
    async (input: QuickFileInput) => {
      if (file?.path === input.path && file.root === input.root && !file.dirty) {
        await load(input);
        return;
      }

      if (file?.dirty) {
        const confirmed = window.confirm(`Discard unsaved changes to ${file.name}?`);
        if (!confirmed) {
          return;
        }
      }

      await load(input);
    },
    [file, load],
  );

  const close = useCallback(() => {
    if (file?.dirty) {
      const confirmed = window.confirm(`Discard unsaved changes to ${file.name}?`);
      if (!confirmed) {
        return false;
      }
    }

    requestIdRef.current += 1;
    setBusy(false);
    setErrorMessage(undefined);
    setConflict(undefined);
    setFile(undefined);
    return true;
  }, [file]);

  const updateDraft = useCallback((draft: string) => {
    setFile((current) => {
      if (!current || current.kind !== "text") {
        return current;
      }
      return {
        ...current,
        draft,
        dirty: draft !== (current.baseline ?? ""),
      };
    });
  }, []);

  const reload = useCallback(async () => {
    if (!file) {
      return;
    }

    setConflict(undefined);
    setErrorMessage(undefined);
    await load({ root: file.root, path: file.path, displayPath: file.displayPath });
  }, [file, load]);

  const save = useCallback(
    async (overrideRevision?: FileManagerFileRevision) => {
      if (!file || file.kind !== "text" || !file.revision) {
        return;
      }

      setBusy(true);
      setErrorMessage(undefined);

      try {
        const draft = file.draft ?? "";
        const response = await saveFileManagerFileContent({
          root: file.root,
          path: file.path,
          content: draft,
          expectedRevision: overrideRevision ?? file.revision,
        });

        setConflict(undefined);
        setFile((current) => {
          if (!current || current.root !== file.root || current.path !== file.path) {
            return current;
          }

          return {
            ...current,
            draft,
            baseline: draft,
            revision: response.revision,
            dirty: false,
          };
        });
      } catch (error) {
        if (error instanceof FileSaveConflictError) {
          setConflict({
            currentRevision: error.currentRevision,
            message: "This file changed on disk since you opened it.",
          });
        } else {
          setErrorMessage(error instanceof Error ? error.message : "Failed to save file.");
        }
      } finally {
        setBusy(false);
      }
    },
    [file],
  );

  return {
    file,
    busy,
    conflict,
    errorMessage,
    open,
    close,
    updateDraft,
    reload,
    save,
  };
}

function mapResponseToState(
  input: QuickFileInput,
  response: FileManagerFileContentResponse,
): QuickFileState {
  return {
    root: input.root,
    path: response.path,
    displayPath: input.displayPath,
    name: response.name,
    loading: false,
    error: undefined,
    kind: response.kind,
    mimeType: response.mimeType,
    isWritable: response.isWritable,
    revision: response.revision,
    baseline: response.kind === "text" ? response.content : undefined,
    draft: response.kind === "text" ? response.content : undefined,
    binaryContentBase64: response.kind === "binary" ? response.content : undefined,
    dirty: false,
  };
}

function basenameOf(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const segments = trimmed.split("/");
  return segments[segments.length - 1] || trimmed || path;
}
