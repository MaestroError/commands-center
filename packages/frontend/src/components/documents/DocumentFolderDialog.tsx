import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createDocumentFolder } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { DocumentScope } from "@cc/shared/schemas";
import { Input } from "@/components/ui/input";

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
  const restoreFocusRef = useRef(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  const close = () => {
    props.onClose();
    requestAnimationFrame(() => restoreFocusRef.current?.focus());
  };

  const mutation = useMutation({
    mutationFn: createDocumentFolder,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documentTree });
      close();
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
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Folder</DialogTitle>
          <DialogDescription>Create a folder inside the Documents directory.</DialogDescription>
        </DialogHeader>

        <label className="mt-4 grid gap-1 text-sm text-text-secondary">
          Folder path
          <Input
            className="font-mono text-xs"
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

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button disabled={!canSubmit || mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
