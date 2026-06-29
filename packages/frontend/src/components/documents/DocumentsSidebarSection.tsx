import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { BookOpenText, ChevronRight, FilePlus, Folder, FolderPlus } from "lucide-react";

import type { DocumentTreeNode } from "@cc/shared/schemas";

import { isRouteActive } from "@/app/routes";
import { getDocumentTree } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import { DocumentCreateDialog } from "./DocumentCreateDialog";
import { DocumentFolderDialog } from "./DocumentFolderDialog";

const DOCUMENTS_PATH = "/documents";
/** Folders may nest up to this depth. Folders at the max depth can only hold documents. */
export const MAX_FOLDER_DEPTH = 5;

type DocumentsSidebarSectionProps = {
  collapsed: boolean;
  pathname: string;
  onNavigate: () => void;
};

export function DocumentsSidebarSection(props: DocumentsSidebarSectionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = isRouteActive(props.pathname, DOCUMENTS_PATH);
  const selectedPath = new URLSearchParams(location.search).get("path");
  const [open, setOpen] = useState(isActive);
  // Folder (relative to Documents/) a new document/folder is being created in.
  const [createDocFolder, setCreateDocFolder] = useState<string | null>(null);
  const [createFolderParent, setCreateFolderParent] = useState<string | null>(null);

  useEffect(() => {
    if (isActive) {
      setOpen(true);
    }
  }, [isActive]);

  const treeQuery = useQuery({
    queryKey: queryKeys.documentTree,
    queryFn: getDocumentTree,
    enabled: !props.collapsed,
  });
  const tree = treeQuery.data?.tree ?? [];

  if (props.collapsed) {
    return (
      <NavLink
        aria-label="Documents"
        className={[
          "flex h-10 items-center justify-center rounded-lg border transition",
          isActive
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-border bg-surface text-text-secondary hover:border-accent/40 hover:text-text-primary",
        ].join(" ")}
        onClick={props.onNavigate}
        title="Documents"
        to={DOCUMENTS_PATH}
      >
        <BookOpenText className="h-4 w-4 shrink-0" />
      </NavLink>
    );
  }

  return (
    <div className="grid gap-0.5" data-testid="documents-sidebar-section">
      <div
        className={
          isActive
            ? "cc-nav-item-active flex items-center gap-1 rounded-lg px-1.5 py-2 text-sm font-medium transition"
            : "flex items-center gap-1 rounded-lg px-1.5 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface hover:text-text-primary"
        }
      >
        <button
          aria-expanded={open}
          aria-label={open ? "Collapse Documents" : "Expand Documents"}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:text-text-primary"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <NavLink
          className="flex min-w-0 flex-1 items-center gap-2"
          onClick={props.onNavigate}
          to={DOCUMENTS_PATH}
        >
          <BookOpenText className="h-4 w-4 shrink-0" />
          <span className="truncate">Documents</span>
        </NavLink>
        <button
          aria-label="New folder"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
          onClick={() => setCreateFolderParent("")}
          title="New folder"
          type="button"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>

      {open ? (
        <div className="grid gap-0.5 pl-1.5">
          {treeQuery.isLoading ? (
            <p className="px-2 py-1 text-xs text-text-secondary">Loading…</p>
          ) : tree.length === 0 ? (
            <p className="px-2 py-1 text-xs text-text-secondary">No folders yet.</p>
          ) : (
            tree.map((node) => (
              <DocumentSidebarNode
                key={node.relativePath}
                node={node}
                depth={1}
                selectedPath={selectedPath}
                onAddFolder={setCreateFolderParent}
                onAddDocument={setCreateDocFolder}
                onOpenDocument={(path) => {
                  void navigate(`/documents?path=${encodeURIComponent(path)}`);
                  props.onNavigate();
                }}
              />
            ))
          )}
        </div>
      ) : null}

      {createDocFolder !== null ? (
        <DocumentCreateDialog
          defaultFolder={createDocFolder}
          onClose={() => setCreateDocFolder(null)}
        />
      ) : null}
      {createFolderParent !== null ? (
        <DocumentFolderDialog
          defaultParent={createFolderParent}
          onClose={() => setCreateFolderParent(null)}
        />
      ) : null}
    </div>
  );
}

type DocumentSidebarNodeProps = {
  node: DocumentTreeNode;
  depth: number;
  selectedPath: string | null;
  onAddFolder: (parent: string) => void;
  onAddDocument: (folder: string) => void;
  onOpenDocument: (path: string) => void;
};

function DocumentSidebarNode(props: DocumentSidebarNodeProps) {
  const { node, depth } = props;
  const [open, setOpen] = useState(true);

  if (node.type === "directory") {
    const canAddFolder = depth < MAX_FOLDER_DEPTH;

    return (
      <div>
        <div className="group flex items-center gap-1 rounded-lg px-1 py-1 text-sm text-text-secondary transition hover:bg-surface-elevated">
          <button
            aria-expanded={open}
            aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
            />
            <Folder className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{node.name}</span>
          </button>
          {canAddFolder ? (
            <button
              aria-label={`New folder in ${node.name}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary opacity-0 transition hover:bg-surface hover:text-text-primary focus:opacity-100 group-hover:opacity-100"
              onClick={() => props.onAddFolder(node.relativePath)}
              title="New folder"
              type="button"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            aria-label={`New document in ${node.name}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary opacity-0 transition hover:bg-surface hover:text-text-primary focus:opacity-100 group-hover:opacity-100"
            onClick={() => props.onAddDocument(node.relativePath)}
            title="New document"
            type="button"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </button>
        </div>
        {open && node.children && node.children.length > 0 ? (
          <div className="grid gap-0.5 pl-3">
            {node.children.map((child) => (
              <DocumentSidebarNode
                key={child.relativePath}
                node={child}
                depth={depth + 1}
                selectedPath={props.selectedPath}
                onAddFolder={props.onAddFolder}
                onAddDocument={props.onAddDocument}
                onOpenDocument={props.onOpenDocument}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const isSelected = props.selectedPath === node.relativePath;

  return (
    <button
      className={`flex w-full items-center gap-1.5 rounded-lg px-1 py-1 pl-[1.375rem] text-left text-sm transition ${
        isSelected
          ? "bg-accent/10 text-accent"
          : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
      }`}
      onClick={() => props.onOpenDocument(node.relativePath)}
      type="button"
    >
      <BookOpenText className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{node.title ?? node.name}</span>
    </button>
  );
}
