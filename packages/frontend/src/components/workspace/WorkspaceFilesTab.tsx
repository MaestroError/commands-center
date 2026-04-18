import { useCallback, useEffect, useState } from "react";
import { getWorkspaceTree, type FileNode } from "../../lib/api";

type WorkspaceFilesTabProps = {
  agentId: string;
};

type TreeNodeProps = {
  node: FileNode;
  agentId: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  depth: number;
};

function TreeNode({ node, agentId, selectedPath, onSelect, depth }: TreeNodeProps) {
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
        const nodes = await getWorkspaceTree(agentId, node.path);
        setChildren(nodes);
      } catch {
        setChildren([]);
      } finally {
        setLoading(false);
      }
    }
    setExpanded(true);
  }, [isDir, expanded, children, agentId, node.path, onSelect]);

  return (
    <div>
      <button
        type="button"
        className={`w-full flex items-center gap-1.5 px-2 py-1 text-left text-xs rounded-md transition ${
          isSelected ? "bg-accent/10 text-accent" : "text-text-primary hover:bg-surface-elevated"
        }`}
        style={{ paddingLeft: `${String(depth * 16 + 8)}px` }}
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

      {expanded && children && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              agentId={agentId}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkspaceFilesTab({ agentId }: WorkspaceFilesTabProps) {
  const [roots, setRoots] = useState<FileNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

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
          agentId={agentId}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
          depth={0}
        />
      ))}
    </div>
  );
}
