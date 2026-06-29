import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createDocument } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

type DocumentCreateDialogProps = {
  onClose: () => void;
};

export function DocumentCreateDialog(props: DocumentCreateDialogProps) {
  const [title, setTitle] = useState("");
  const [path, setPath] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createDocument,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documentTree });
      props.onClose();
    },
  });

  const derivedPath = path.trim() || (title.trim() ? `${slugify(title.trim())}.md` : "");

  const handleSubmit = () => {
    if (!derivedPath) return;
    const finalPath =
      derivedPath.endsWith(".md") || derivedPath.endsWith(".markdown")
        ? derivedPath
        : `${derivedPath}.md`;

    mutation.mutate({
      path: finalPath,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/80 p-4 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <section
        aria-labelledby="create-document-title"
        aria-modal="true"
        className="cc-panel w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-xl font-semibold text-text-primary" id="create-document-title">
          New Document
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Create a markdown document in the Documents folder.
        </p>

        <label className="mt-4 grid gap-1 text-sm text-text-secondary">
          Title
          <input
            className="cc-input"
            placeholder="e.g. Architecture Overview"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="mt-3 grid gap-1 text-sm text-text-secondary">
          Path
          <input
            className="cc-input font-mono text-xs"
            placeholder={derivedPath || "e.g. design/overview.md"}
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          <span className="text-xs text-text-secondary">
            Relative to Documents/. Auto-derived from title if left blank.
          </span>
        </label>

        <label className="mt-3 grid gap-1 text-sm text-text-secondary">
          Description
          <textarea
            className="cc-input min-h-16 resize-y"
            placeholder="Short description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        {mutation.isError ? (
          <p className="mt-3 text-sm text-danger">
            {mutation.error instanceof Error
              ? mutation.error.message
              : "Failed to create document."}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
            Cancel
          </button>
          <button
            className="cc-button"
            disabled={!derivedPath || mutation.isPending}
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
