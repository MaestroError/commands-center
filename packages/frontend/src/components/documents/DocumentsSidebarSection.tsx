import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { BookOpenText, ChevronRight, FilePlus, Folder, FolderPlus, Search } from "lucide-react";

import type { DocumentScope, DocumentTreeNode } from "@cc/shared/schemas";

import { isRouteActive } from "@/app/routes";
import { getDocumentTree, listSpecialists } from "@/lib/api";
import { buildDocumentFolderHref } from "@/lib/document-href";
import { queryKeys } from "@/lib/query-keys";

import { DocumentCreateDialog } from "./DocumentCreateDialog";
import { DocumentFolderDialog } from "./DocumentFolderDialog";

const DOCUMENTS_PATH = "/documents";
/** Folders may nest up to this depth. Folders at the max depth can only hold documents. */
export const MAX_FOLDER_DEPTH = 5;
const DEFAULT_PRIVATE_DOCUMENT_FOLDER = "notes";

type DocumentTarget = {
  scope: DocumentScope;
  ownerSlug: string | null;
  path: string;
};

type DocumentsSidebarSectionProps = {
  collapsed: boolean;
  pathname: string;
  onNavigate: () => void;
  onOpenSearch: () => void;
};

export function DocumentsSidebarSection(props: DocumentsSidebarSectionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = isRouteActive(props.pathname, DOCUMENTS_PATH);
  const selectedTarget = parseDocumentTarget(location.search);
  const selectedFolderTarget = parseDocumentFolderTarget(location.search);
  const [open, setOpen] = useState(isActive);
  const [createDocTarget, setCreateDocTarget] = useState<DocumentTarget | null>(null);
  const [createFolderTarget, setCreateFolderTarget] = useState<DocumentTarget | null>(null);
  const [privateDocumentPickerOpen, setPrivateDocumentPickerOpen] = useState(false);

  // Auto-expand on navigating into the Documents page, auto-collapse on
  // navigating away to any other page. Only fires on route transitions (not
  // on every render), so manually toggling the section while staying on the
  // Documents page is unaffected. Nested folder/document expand state lives
  // in each DocumentSidebarNode and is untouched by this.
  useEffect(() => {
    setOpen(isActive);
  }, [isActive]);

  const treeQuery = useQuery({
    queryKey: queryKeys.documentTree,
    queryFn: getDocumentTree,
    enabled: !props.collapsed && open,
    staleTime: 0,
  });
  const specialistsQuery = useQuery({
    queryKey: queryKeys.specialists,
    queryFn: listSpecialists,
    enabled: privateDocumentPickerOpen,
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
    <div className="grid min-w-0 gap-0.5" data-testid="documents-sidebar-section">
      <div
        className={
          isActive
            ? "cc-nav-item-active flex min-w-0 items-center gap-1 rounded-lg px-1.5 py-2 text-sm font-medium transition"
            : "flex min-w-0 items-center gap-1 rounded-lg px-1.5 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface hover:text-text-primary"
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
          <span className="min-w-0 flex-1 truncate">Documents</span>
        </NavLink>
        <button
          aria-label="Search documents"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
          onClick={props.onOpenSearch}
          title="Search"
          type="button"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
        <button
          aria-label="New folder"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
          onClick={() => setCreateFolderTarget({ scope: "global", ownerSlug: null, path: "" })}
          title="New folder"
          type="button"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
        <button
          aria-label="New private document"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
          onClick={() => setPrivateDocumentPickerOpen(true)}
          title="New private document"
          type="button"
        >
          <FilePlus className="h-3.5 w-3.5" />
        </button>
      </div>

      {open ? (
        <div className="grid min-w-0 gap-0.5 overflow-hidden rounded-md bg-surface p-1">
          {treeQuery.isLoading ? (
            <p className="px-2 py-1 text-xs text-text-secondary">Loading…</p>
          ) : (
            <>
              <DocumentTreeGroup
                label="Global Documents"
                target={{ scope: "global", ownerSlug: null, path: "" }}
                tree={tree}
                selectedTarget={selectedTarget}
                selectedFolderTarget={selectedFolderTarget}
                onAddFolder={setCreateFolderTarget}
                onAddDocument={setCreateDocTarget}
                onOpenDocument={(target) => {
                  void navigate(documentUrl(target));
                  props.onNavigate();
                }}
                onOpenFolder={(target) => {
                  void navigate(folderUrl(target));
                  props.onNavigate();
                }}
              />
              {(treeQuery.data?.privateTrees ?? []).map((group) => (
                <DocumentTreeGroup
                  key={group.ownerSpecialistId}
                  label={group.ownerName}
                  target={{ scope: "private", ownerSlug: group.ownerSlug, path: "" }}
                  tree={group.tree}
                  selectedTarget={selectedTarget}
                  selectedFolderTarget={selectedFolderTarget}
                  onAddFolder={setCreateFolderTarget}
                  onAddDocument={setCreateDocTarget}
                  onOpenDocument={(target) => {
                    void navigate(documentUrl(target));
                    props.onNavigate();
                  }}
                  onOpenFolder={(target) => {
                    void navigate(folderUrl(target));
                    props.onNavigate();
                  }}
                />
              ))}
            </>
          )}
        </div>
      ) : null}

      {createDocTarget !== null ? (
        <DocumentCreateDialog
          scope={createDocTarget.scope}
          ownerSlug={createDocTarget.ownerSlug}
          defaultFolder={createDocTarget.path}
          onClose={() => setCreateDocTarget(null)}
        />
      ) : null}
      {createFolderTarget !== null ? (
        <DocumentFolderDialog
          scope={createFolderTarget.scope}
          ownerSlug={createFolderTarget.ownerSlug}
          defaultParent={createFolderTarget.path}
          onClose={() => setCreateFolderTarget(null)}
        />
      ) : null}
      {privateDocumentPickerOpen ? (
        <PrivateDocumentTargetDialog
          specialists={specialistsQuery.data ?? []}
          isLoading={specialistsQuery.isLoading}
          onClose={() => setPrivateDocumentPickerOpen(false)}
          onSelect={(ownerSlug) => {
            setPrivateDocumentPickerOpen(false);
            setCreateDocTarget({
              scope: "private",
              ownerSlug,
              path: DEFAULT_PRIVATE_DOCUMENT_FOLDER,
            });
          }}
        />
      ) : null}
    </div>
  );
}

function parseDocumentTarget(search: string): DocumentTarget | null {
  const params = new URLSearchParams(search);
  const path = params.get("path");
  if (!path) {
    return null;
  }

  const scope = params.get("scope") === "private" ? "private" : "global";
  const ownerSlug = scope === "private" ? params.get("owner") : null;
  if (scope === "private" && !ownerSlug) {
    return null;
  }

  return {
    scope,
    ownerSlug,
    path,
  };
}

function parseDocumentFolderTarget(search: string): DocumentTarget | null {
  const params = new URLSearchParams(search);
  if (!params.has("folder")) {
    return null;
  }
  const path = params.get("folder") ?? "";

  const scope = params.get("scope") === "private" ? "private" : "global";
  const ownerSlug = scope === "private" ? params.get("owner") : null;
  if (scope === "private" && !ownerSlug) {
    return null;
  }

  return { scope, ownerSlug, path };
}

function folderUrl(target: DocumentTarget): string {
  return buildDocumentFolderHref(target.path, {
    scope: target.scope,
    ownerSlug: target.ownerSlug,
  });
}

function documentUrl(target: DocumentTarget): string {
  const params = new URLSearchParams();
  if (target.scope !== "global") {
    params.set("scope", target.scope);
  }
  if (target.ownerSlug) {
    params.set("owner", target.ownerSlug);
  }
  params.set("path", target.path);
  return `${DOCUMENTS_PATH}?${params.toString()}`;
}

function targetKey(target: DocumentTarget): string {
  return `${target.scope}:${target.ownerSlug ?? ""}:${target.path}`;
}

function DocumentTreeGroup(props: {
  label: string;
  target: DocumentTarget;
  tree: DocumentTreeNode[];
  selectedTarget: DocumentTarget | null;
  selectedFolderTarget: DocumentTarget | null;
  onAddFolder: (target: DocumentTarget) => void;
  onAddDocument: (target: DocumentTarget) => void;
  onOpenDocument: (target: DocumentTarget) => void;
  onOpenFolder: (target: DocumentTarget) => void;
}) {
  const [open, setOpen] = useState(true);
  const isSelected =
    props.selectedFolderTarget !== null &&
    targetKey(props.selectedFolderTarget) === targetKey(props.target);

  return (
    <div className="grid min-w-0 gap-0.5">
      <div
        className={`group flex min-w-0 items-center gap-1 rounded-lg px-1 py-1 text-sm font-medium transition ${
          isSelected ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-surface-elevated"
        }`}
      >
        <button
          aria-expanded={open}
          aria-label={open ? `Collapse ${props.label}` : `Expand ${props.label}`}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:text-text-primary"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
        </button>
        <button
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={() => props.onOpenFolder(props.target)}
          type="button"
        >
          <Folder className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{props.label}</span>
        </button>
        <button
          aria-label={`New folder in ${props.label}`}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary opacity-0 transition hover:bg-surface hover:text-text-primary focus:opacity-100 group-hover:opacity-100"
          onClick={() => props.onAddFolder(props.target)}
          title="New folder"
          type="button"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
        <button
          aria-label={`New document in ${props.label}`}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary opacity-0 transition hover:bg-surface hover:text-text-primary focus:opacity-100 group-hover:opacity-100"
          onClick={() => props.onAddDocument(props.target)}
          title="New document"
          type="button"
        >
          <FilePlus className="h-3.5 w-3.5" />
        </button>
      </div>
      {open ? (
        props.tree.length === 0 ? (
          <p className="px-6 py-1 text-xs text-text-secondary">No folders yet.</p>
        ) : (
          <div className="grid min-w-0 gap-0.5 pl-3">
            {props.tree.map((node) => (
              <DocumentSidebarNode
                key={`${targetKey(props.target)}:${node.relativePath}`}
                node={node}
                depth={1}
                selectedTarget={props.selectedTarget}
                selectedFolderTarget={props.selectedFolderTarget}
                onAddFolder={props.onAddFolder}
                onAddDocument={props.onAddDocument}
                onOpenDocument={props.onOpenDocument}
                onOpenFolder={props.onOpenFolder}
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

type DocumentSidebarNodeProps = {
  node: DocumentTreeNode;
  depth: number;
  selectedTarget: DocumentTarget | null;
  selectedFolderTarget: DocumentTarget | null;
  onAddFolder: (target: DocumentTarget) => void;
  onAddDocument: (target: DocumentTarget) => void;
  onOpenDocument: (target: DocumentTarget) => void;
  onOpenFolder: (target: DocumentTarget) => void;
};

function nodeTarget(node: DocumentTreeNode): DocumentTarget {
  return {
    scope: node.scope,
    ownerSlug: node.ownerSlug,
    path: node.relativePath,
  };
}

function isSelectedDocumentAncestor(
  directory: DocumentTarget,
  selectedTarget: DocumentTarget | null,
): boolean {
  return (
    selectedTarget !== null &&
    targetKey({ ...directory, path: "" }) === targetKey({ ...selectedTarget, path: "" }) &&
    selectedTarget.path.startsWith(`${directory.path}/`)
  );
}

function DocumentSidebarNode(props: DocumentSidebarNodeProps) {
  const { node, depth } = props;
  const target = nodeTarget(node);
  const [open, setOpen] = useState(
    () => node.type === "directory" && isSelectedDocumentAncestor(target, props.selectedTarget),
  );

  useEffect(() => {
    if (node.type === "directory" && isSelectedDocumentAncestor(target, props.selectedTarget)) {
      setOpen(true);
    }
  }, [node.type, props.selectedTarget, target]);

  if (node.type === "directory") {
    const canAddFolder = depth < MAX_FOLDER_DEPTH;
    const isSelectedFolder =
      props.selectedFolderTarget !== null &&
      targetKey(props.selectedFolderTarget) === targetKey(target);

    return (
      <div className="min-w-0">
        <div
          className={`group flex min-w-0 items-center gap-1 rounded-lg px-1 py-1 text-sm transition ${
            isSelectedFolder
              ? "bg-accent/10 text-accent"
              : "text-text-secondary hover:bg-surface-elevated"
          }`}
        >
          <button
            aria-expanded={open}
            aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:text-text-primary"
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
            />
          </button>
          <button
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            onClick={() => props.onOpenFolder(target)}
            type="button"
          >
            <Folder className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
          </button>
          {canAddFolder ? (
            <button
              aria-label={`New folder in ${node.name}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary opacity-0 transition hover:bg-surface hover:text-text-primary focus:opacity-100 group-hover:opacity-100"
              onClick={() => props.onAddFolder(target)}
              title="New folder"
              type="button"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            aria-label={`New document in ${node.name}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary opacity-0 transition hover:bg-surface hover:text-text-primary focus:opacity-100 group-hover:opacity-100"
            onClick={() => props.onAddDocument(target)}
            title="New document"
            type="button"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </button>
        </div>
        {open && node.children && node.children.length > 0 ? (
          <div className="grid min-w-0 gap-0.5 pl-3">
            {node.children.map((child) => (
              <DocumentSidebarNode
                key={`${targetKey(target)}:${child.relativePath}`}
                node={child}
                depth={depth + 1}
                selectedTarget={props.selectedTarget}
                selectedFolderTarget={props.selectedFolderTarget}
                onAddFolder={props.onAddFolder}
                onAddDocument={props.onAddDocument}
                onOpenDocument={props.onOpenDocument}
                onOpenFolder={props.onOpenFolder}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const isSelected =
    props.selectedTarget !== null && targetKey(props.selectedTarget) === targetKey(target);

  return (
    <button
      className={`flex w-full min-w-0 items-center gap-1.5 rounded-lg px-1 py-1 pl-[1.375rem] text-left text-sm transition ${
        isSelected
          ? "bg-accent/10 text-accent"
          : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
      }`}
      onClick={() => props.onOpenDocument(target)}
      type="button"
    >
      <BookOpenText className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{node.title ?? node.name}</span>
    </button>
  );
}

function PrivateDocumentTargetDialog(props: {
  specialists: Array<{ slug: string; name: string }>;
  isLoading: boolean;
  onClose: () => void;
  onSelect: (ownerSlug: string) => void;
}) {
  const [selectedSlug, setSelectedSlug] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/80 p-4 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <section
        aria-labelledby="private-document-target-title"
        aria-modal="true"
        className="cc-panel w-full max-w-md p-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-xl font-semibold text-text-primary" id="private-document-target-title">
          New Private Document
        </h2>

        <label className="mt-4 grid gap-1 text-sm text-text-secondary">
          Specialist
          <select
            className="cc-input"
            disabled={props.isLoading || props.specialists.length === 0}
            value={selectedSlug}
            onChange={(event) => setSelectedSlug(event.target.value)}
          >
            <option value="">{props.isLoading ? "Loading..." : "Select a specialist"}</option>
            {props.specialists.map((specialist) => (
              <option key={specialist.slug} value={specialist.slug}>
                {specialist.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
            Cancel
          </button>
          <button
            className="cc-button"
            disabled={!selectedSlug}
            onClick={() => props.onSelect(selectedSlug)}
            type="button"
          >
            Continue
          </button>
        </div>
      </section>
    </div>
  );
}
