import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createDocumentFolder } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { DocumentScope } from "@cc/shared/schemas";

type DocumentFolderDialogProps = {
  onClose: () => void;
  scope?: DocumentScope;
  ownerSlug?: string | null;
  /** Parent folder the new folder is created in, relative to Documents/ (no trailing slash). */
  defaultParent?: string;
};

export function DocumentFolderDialog(props: DocumentFolderDialogProps) {
  const [path, setPath] = useState(props.defaultParent ? `${props.defaultParent}/` : "");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createDocumentFolder,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documentTree });
      props.onClose();
    },
  });

  const trimmedPath = path.trim();
  // The default value is prefilled as "<parent>/" (a user can also type a
  // trailing slash). A path ending in "/" has an empty final segment and is
  // rejected by the backend schema, so keep Create disabled until it's gone
  // rather than silently stripping it — stripping "<parent>/" on its own
  // would submit the existing parent folder as if it were a new one.
  const canSubmit = trimmedPath.length > 0 && !trimmedPath.endsWith("/");

  const handleSubmit = () => {
    if (!canSubmit) return;
    mutation.mutate({
      ...(props.scope && props.scope !== "global" ? { scope: props.scope } : {}),
      ...(props.ownerSlug ? { ownerSlug: props.ownerSlug } : {}),
      path: trimmedPath,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/80 p-4 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <section
        aria-labelledby="create-folder-title"
        aria-modal="true"
        className="cc-panel w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-xl font-semibold text-text-primary" id="create-folder-title">
          New Folder
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Create a folder inside the Documents directory.
        </p>

        <label className="mt-4 grid gap-1 text-sm text-text-secondary">
          Folder path
          <input
            className="cc-input font-mono text-xs"
            placeholder="e.g. design/specs"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          <span className="text-xs text-text-secondary">
            Relative to Documents/. Nested paths are created automatically.
          </span>
        </label>

        {mutation.isError ? (
          <p className="mt-3 text-sm text-danger">
            {mutation.error instanceof Error ? mutation.error.message : "Failed to create folder."}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
            Cancel
          </button>
          <button
            className="cc-button"
            disabled={!canSubmit || mutation.isPending}
            onClick={handleSubmit}
            type="button"
          >
            {mutation.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </section>
    </div>
  );
}
