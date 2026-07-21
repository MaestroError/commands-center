import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, ChevronRight, Folder } from "lucide-react";

import { MAX_DOCUMENT_FOLDER_DEPTH, type DocumentTreeNode } from "@cc/shared/schemas";

import { Checkbox } from "@/components/ui/checkbox";
import { getDocumentTree } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

type GlobalDocumentAccessTreeProps = {
  fullAccess: boolean;
  selectedFolderPaths: Set<string>;
  onFullAccessChange: (next: boolean) => void;
  onSelectedFolderPathsChange: (next: Set<string>) => void;
};

export function GlobalDocumentAccessTree(props: GlobalDocumentAccessTreeProps) {
  const treeQuery = useQuery({
    queryKey: queryKeys.documentTree,
    queryFn: getDocumentTree,
  });
  const rootChecked = props.fullAccess
    ? true
    : props.selectedFolderPaths.size > 0
      ? "indeterminate"
      : false;

  return (
    <div className="grid gap-2">
      <label className="flex cursor-pointer items-center gap-3 text-text-primary">
        <Checkbox
          checked={rootChecked}
          data-testid="token-documents-global"
          onCheckedChange={(checked) => props.onFullAccessChange(checked === true)}
        />
        <span className="font-medium">Global Documents</span>
      </label>

      {treeQuery.isLoading ? (
        <p className="pl-7 text-xs text-text-secondary" data-testid="token-documents-tree-loading">
          Loading global document folders…
        </p>
      ) : null}
      {treeQuery.isError ? (
        <p className="pl-7 text-xs text-danger" data-testid="token-documents-tree-error">
          Global document folders could not be loaded.
        </p>
      ) : null}
      {treeQuery.data && treeQuery.data.tree.length === 0 ? (
        <p className="pl-7 text-xs text-text-secondary">No global document folders yet.</p>
      ) : null}
      {treeQuery.data && treeQuery.data.tree.length > 0 ? (
        <div className="grid max-h-80 gap-0.5 overflow-auto pl-3">
          {treeQuery.data.tree.map((node) => (
            <GlobalDocumentAccessNode
              depth={1}
              fullAccess={props.fullAccess}
              key={node.relativePath}
              node={node}
              selectedFolderPaths={props.selectedFolderPaths}
              onSelectedFolderPathsChange={props.onSelectedFolderPathsChange}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type GlobalDocumentAccessNodeProps = {
  depth: number;
  fullAccess: boolean;
  node: DocumentTreeNode;
  selectedFolderPaths: Set<string>;
  onSelectedFolderPathsChange: (next: Set<string>) => void;
};

function GlobalDocumentAccessNode(props: GlobalDocumentAccessNodeProps) {
  const { depth, node, selectedFolderPaths } = props;
  const selected = selectedFolderPaths.has(node.relativePath);
  const inherited =
    props.fullAccess ||
    [...selectedFolderPaths].some(
      (folderPath) =>
        folderPath !== node.relativePath && isPathWithin(node.relativePath, folderPath),
    );
  const hasSelectedDescendant = [...selectedFolderPaths].some(
    (folderPath) => folderPath !== node.relativePath && isPathWithin(folderPath, node.relativePath),
  );
  const [open, setOpen] = useState(
    () => node.type === "directory" && (selected || inherited || hasSelectedDescendant),
  );

  if (node.type === "file") {
    return (
      <div className="flex min-w-0 items-center gap-2 py-1 pl-7 text-xs text-text-muted">
        <BookOpenText className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{node.title ?? node.name}</span>
      </div>
    );
  }

  const children = node.children ?? [];
  const canExpand = children.length > 0 && depth < MAX_DOCUMENT_FOLDER_DEPTH;
  const checked = selected || inherited ? true : hasSelectedDescendant ? "indeterminate" : false;

  function updateSelection(nextChecked: boolean): void {
    const next = new Set(selectedFolderPaths);
    if (nextChecked) {
      for (const folderPath of next) {
        if (isPathWithin(folderPath, node.relativePath)) {
          next.delete(folderPath);
        }
      }
      next.add(node.relativePath);
    } else {
      next.delete(node.relativePath);
    }
    props.onSelectedFolderPathsChange(next);
  }

  return (
    <div className="grid min-w-0 gap-0.5">
      <div className="flex min-w-0 items-center gap-1 rounded-lg px-1 py-1 text-sm text-text-secondary hover:bg-surface-elevated">
        {canExpand ? (
          <button
            aria-expanded={open}
            aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:text-text-primary"
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        <Checkbox
          aria-label={`Allow access to ${node.relativePath}`}
          checked={checked}
          data-testid={`token-documents-folder-${node.relativePath}`}
          disabled={inherited}
          onCheckedChange={(nextChecked) => updateSelection(nextChecked === true)}
        />
        <Folder className="ml-1 h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-text-primary">{node.name}</span>
      </div>

      {depth === MAX_DOCUMENT_FOLDER_DEPTH && children.length > 0 ? (
        <p
          className="pl-12 text-xs text-text-muted"
          data-testid={`token-documents-depth-limit-${node.relativePath}`}
        >
          Includes all deeper descendants when selected.
        </p>
      ) : null}
      {open && canExpand ? (
        <div className="grid min-w-0 gap-0.5 pl-3">
          {children.map((child) => (
            <GlobalDocumentAccessNode
              depth={depth + 1}
              fullAccess={props.fullAccess}
              key={child.relativePath}
              node={child}
              selectedFolderPaths={selectedFolderPaths}
              onSelectedFolderPathsChange={props.onSelectedFolderPathsChange}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function isPathWithin(candidate: string, folderPath: string): boolean {
  return candidate === folderPath || candidate.startsWith(`${folderPath}/`);
}
