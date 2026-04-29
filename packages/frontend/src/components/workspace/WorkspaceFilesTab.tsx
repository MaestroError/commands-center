import { useCallback, useEffect, useState } from "react";
import { FilePenLine, FolderSearch } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { resolveAgentWorkspacePath } from "@/lib/agent-workspace-path";
import { buildFileManagerHref } from "@/lib/file-manager-href";

import { getWorkspaceTree, type FileNode } from "../../lib/api";

type WorkspaceFilesTabProps = {
  agentId: string;
  agentSlug: string;
  onOpenFile?: (path: string) => void;
};

type TreeNodeProps = {
  node: FileNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  depth: number;
  onOpenLocation: (path: string) => void;
  onOpenFile?: (path: string) => void;
  onToggleDirectory: (path: string) => Promise<FileNode[]>;
};

function TreeNode({
  node,
  selectedPath,
  onSelect,
  depth,
  onOpenLocation,
  onOpenFile,
  onToggleDirectory,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const isDir = node.type === "directory";
  const isSelected = selectedPath === node.path;

  const handleToggle = useCallback(async () => {
    if (!isDir) {
      onSelect(node.path);
      return;
    }

    if (expanded) {
      setExpanded(false);
      return;
    }

    if (children === null) {
      setLoading(true);
      try {
        const nodes = await onToggleDirectory(node.path);
        setChildren(nodes);
      } catch {
        setChildren([]);
      } finally {
        setLoading(false);
      }
    }
    setExpanded(true);
  }, [children, expanded, isDir, node.path, onSelect, onToggleDirectory]);

  return (
    <div className="group">
      <div
        className={`flex items-center gap-1 rounded-md px-1 py-0.5 transition ${
          isSelected ? "bg-accent/10 text-accent" : "text-text-primary hover:bg-surface-elevated"
        }`}
        style={{ paddingLeft: `${String(depth * 16 + 4)}px` }}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-0.5 text-left text-xs"
          onDoubleClick={() => {
            if (!isDir) {
              onOpenFile?.(node.path);
            }
          }}
          onClick={() => void handleToggle()}
        >
          {isDir ? (
            <>
              <span className="text-text-secondary w-3 text-center text-[10px]">
                {loading ? "…" : expanded ? "▾" : "▸"}
              </span>
              <svg
                className="h-3.5 w-3.5 shrink-0 text-text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            </>
          ) : (
            <>
              <span className="w-3" />
              <svg
                className="h-3.5 w-3.5 shrink-0 text-text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </>
          )}
          <span className="truncate">{node.name}</span>
        </button>
        <button
          aria-label={`Show ${node.name} in file manager`}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary opacity-100 transition hover:text-text-primary sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onOpenLocation(node.path);
          }}
          title="Show file location"
          type="button"
        >
          <FolderSearch className="h-3.5 w-3.5" />
        </button>
        {!isDir ? (
          <button
            aria-label={`Open ${node.name} in quick editor`}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary opacity-100 transition hover:text-text-primary sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(node.path);
              onOpenFile?.(node.path);
            }}
            title="Open in quick editor"
            type="button"
          >
            <FilePenLine className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {expanded && children && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
              onOpenLocation={onOpenLocation}
              onOpenFile={onOpenFile}
              onToggleDirectory={onToggleDirectory}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkspaceFilesTab({ agentId, agentSlug, onOpenFile }: WorkspaceFilesTabProps) {
  const navigate = useNavigate();
  const [roots, setRoots] = useState<FileNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const openLocation = useCallback(
    (path: string) => {
      void navigate(buildFileManagerHref({ path: resolveAgentWorkspacePath(agentSlug, path) }));
    },
    [agentSlug, navigate],
  );

  const loadDirectory = useCallback((path: string) => getWorkspaceTree(agentId, path), [agentId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void getWorkspaceTree(agentId)
      .then((nodes) => {
        if (!cancelled) {
          setRoots(nodes);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load files");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-text-secondary">
        Loading files...
      </div>
    );
  }

  if (error) {
    return <div className="px-4 py-8 text-center text-sm text-danger">{error}</div>;
  }

  if (!roots || roots.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-text-secondary">No files in workspace</div>
    );
  }

  return (
    <div className="py-1">
      {roots.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
          depth={0}
          onOpenLocation={openLocation}
          onOpenFile={onOpenFile}
          onToggleDirectory={loadDirectory}
        />
      ))}
    </div>
  );
}
