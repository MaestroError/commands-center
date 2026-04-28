import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, FilePenLine, FileSearch, FolderSearch, Pencil, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import type { Agent, GlobalSearchWorkspaceFilesResponse } from "@cc/shared/schemas";

import { listAgents, searchWorkspaceFiles } from "@/lib/api";
import { makeTabKey, parseTabsParam, serializeTabsParam } from "@/hooks/use-editor-tabs";
import { queryKeys } from "@/lib/query-keys";

type GlobalSearchPaletteProps = {
  open: boolean;
  onClose: () => void;
};

type ResultAction = {
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
};

type PaletteResult = {
  id: string;
  group: "Agents" | "Files";
  title: string;
  subtitle?: string;
  markerIcon: React.ReactNode;
  markerLabel: string;
  emphasizedTitle?: React.ReactNode;
  primaryAction: () => void;
  secondaryActions: ResultAction[];
};

export function GlobalSearchPalette(props: GlobalSearchPaletteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());

  useEffect(() => {
    if (!props.open) {
      setQuery("");
    }
  }, [props.open]);

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents,
    queryFn: () => listAgents(),
    enabled: props.open,
  });

  const fileQuery = useQuery({
    queryKey: ["global-search-files", deferredQuery],
    queryFn: () => searchWorkspaceFiles(deferredQuery),
    enabled: props.open && deferredQuery.length > 0,
  });

  const agentResults = useMemo(() => {
    if (deferredQuery.length === 0) {
      return [] satisfies PaletteResult[];
    }

    return (agentsQuery.data ?? [])
      .filter((agent) => {
        const needle = deferredQuery.toLowerCase();
        return (
          agent.name.toLowerCase().includes(needle) ||
          agent.slug.toLowerCase().includes(needle) ||
          agent.role.toLowerCase().includes(needle)
        );
      })
      .slice(0, 8)
      .map((agent) => buildAgentResult(agent, navigate, props.onClose));
  }, [agentsQuery.data, deferredQuery, navigate, props.onClose]);

  const fileResults = useMemo(() => {
    if (deferredQuery.length === 0 || !fileQuery.data) {
      return [] satisfies PaletteResult[];
    }

    return buildFileResults({
      data: fileQuery.data,
      currentPathname: location.pathname,
      locationSearch: location.search,
      navigate,
      onClose: props.onClose,
      query: deferredQuery,
    });
  }, [deferredQuery, fileQuery.data, location.pathname, location.search, navigate, props.onClose]);

  const results = [...agentResults, ...fileResults];
  const isLoading = agentsQuery.isLoading || fileQuery.isLoading;

  if (!props.open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-16 sm:px-6"
      onClick={props.onClose}
    >
      <div
        aria-label="Global search"
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-elevated px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-text-secondary" />
            <input
              aria-label="Search resources"
              autoFocus
              className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  props.onClose();
                }
              }}
              placeholder="Search agents and files"
              type="text"
              value={query}
            />
            <kbd className="hidden rounded border border-border px-2 py-0.5 text-[11px] text-text-secondary sm:inline-block">
              Esc
            </kbd>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {deferredQuery.length === 0 ? (
            <EmptyState message="Search agents by name or slug, and search workspace files by path or content." />
          ) : isLoading ? (
            <EmptyState message="Searching resources..." />
          ) : results.length === 0 ? (
            <EmptyState message="No matching agents or files." />
          ) : (
            <ResultGroups results={results} />
          )}
        </div>
      </div>
    </div>
  );
}

function ResultGroups(props: { results: PaletteResult[] }) {
  const grouped = new Map<PaletteResult["group"], PaletteResult[]>();

  for (const result of props.results) {
    const current = grouped.get(result.group) ?? [];
    current.push(result);
    grouped.set(result.group, current);
  }

  return (
    <div>
      {Array.from(grouped.entries()).map(([group, results]) => (
        <section key={group}>
          <div className="border-b border-border/60 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-text-secondary">
            {group}
          </div>
          <div className="divide-y divide-border/60">
            {results.map((result) => (
              <ResultRow key={result.id} result={result} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ResultRow(props: { result: PaletteResult }) {
  const { result } = props;

  return (
    <div className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-elevated/70">
      <button className="min-w-0 flex-1 text-left" onClick={result.primaryAction} type="button">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary">
            {result.markerIcon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">
              {result.emphasizedTitle ?? result.title}
            </p>
            {result.subtitle ? (
              <p className="truncate text-xs text-text-secondary">{result.subtitle}</p>
            ) : null}
            <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-text-secondary">
              {result.markerLabel}
            </p>
          </div>
        </div>
      </button>
      {result.secondaryActions.length > 0 ? (
        <div className="flex shrink-0 items-center gap-1">
          {result.secondaryActions.map((action) => (
            <button
              aria-label={action.label}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary transition hover:border-accent/40 hover:text-text-primary"
              key={action.label}
              onClick={action.onSelect}
              title={action.label}
              type="button"
            >
              {action.icon}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState(props: { message: string }) {
  return (
    <div className="px-6 py-12 text-center text-sm text-text-secondary">
      <p>{props.message}</p>
    </div>
  );
}

function buildAgentResult(
  agent: Agent,
  navigate: ReturnType<typeof useNavigate>,
  onClose: () => void,
) {
  return {
    id: `agent:${agent.id}`,
    group: "Agents",
    title: agent.name,
    subtitle: `${agent.slug} · ${agent.role}`,
    markerIcon: <Bot className="h-4 w-4" />,
    markerLabel: "Open agent",
    primaryAction: () => {
      void navigate(`/chat/${encodeURIComponent(agent.slug)}`);
      onClose();
    },
    secondaryActions: [
      {
        label: "Edit agent",
        icon: <Pencil className="h-4 w-4" />,
        onSelect: () => {
          void navigate(`/agents/${encodeURIComponent(agent.slug)}/edit`);
          onClose();
        },
      },
    ],
  } satisfies PaletteResult;
}

function buildFileResults(props: {
  data: GlobalSearchWorkspaceFilesResponse;
  query: string;
  currentPathname: string;
  locationSearch: string;
  navigate: ReturnType<typeof useNavigate>;
  onClose: () => void;
}): PaletteResult[] {
  const byPath = new Map<
    string,
    {
      path: string;
      contentMatch?: GlobalSearchWorkspaceFilesResponse["contentMatches"][number];
      nameMatched: boolean;
    }
  >();

  for (const match of props.data.nameMatches) {
    byPath.set(match.path, { path: match.path, nameMatched: true });
  }

  for (const match of props.data.contentMatches) {
    const current = byPath.get(match.path);
    if (current) {
      current.contentMatch ??= match;
      continue;
    }

    byPath.set(match.path, {
      path: match.path,
      contentMatch: match,
      nameMatched: false,
    });
  }

  return Array.from(byPath.values())
    .slice(0, 20)
    .map((entry) => {
      const openPreview = () => {
        void props.navigate(
          buildFileManagerHref(entry.path, props.currentPathname, props.locationSearch, true),
        );
        props.onClose();
      };
      const showLocation = () => {
        void props.navigate(
          buildFileManagerHref(entry.path, props.currentPathname, props.locationSearch, false),
        );
        props.onClose();
      };

      return {
        id: `file:${entry.path}`,
        group: "Files",
        title: entry.path,
        subtitle: entry.contentMatch
          ? `${entry.contentMatch.lineNumber}: ${entry.contentMatch.lineText}`
          : "Path match",
        markerIcon: entry.contentMatch ? (
          <FileSearch className="h-4 w-4" />
        ) : (
          <FilePenLine className="h-4 w-4" />
        ),
        markerLabel: entry.contentMatch ? "Content match" : "Path match",
        emphasizedTitle: entry.nameMatched ? highlightMatch(entry.path, props.query) : undefined,
        primaryAction: openPreview,
        secondaryActions: [
          {
            label: "Show file location",
            icon: <FolderSearch className="h-4 w-4" />,
            onSelect: showLocation,
          },
          {
            label: "Edit file",
            icon: <Pencil className="h-4 w-4" />,
            onSelect: openPreview,
          },
        ],
      } satisfies PaletteResult;
    });
}

function highlightMatch(value: string, query: string): React.ReactNode {
  const normalizedQuery = query.trim();

  if (normalizedQuery.length === 0) {
    return value;
  }

  const lowerValue = value.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  const index = lowerValue.indexOf(lowerQuery);

  if (index === -1) {
    return value;
  }

  const before = value.slice(0, index);
  const match = value.slice(index, index + normalizedQuery.length);
  const after = value.slice(index + normalizedQuery.length);

  return (
    <>
      {before}
      <strong className="font-semibold text-text-primary">{match}</strong>
      {after}
    </>
  );
}

function buildFileManagerHref(
  path: string,
  currentPathname: string,
  currentSearch: string,
  openInEditor: boolean,
): string {
  const params = new URLSearchParams(currentPathname === "/files" ? currentSearch : "");
  params.set("root", "workspace");
  params.set("path", dirname(path));
  params.set("select", path);

  if (openInEditor) {
    const existingTabs = parseTabsParam(params.get("tabs"));
    const key = makeTabKey("workspace", path);
    const nextTabs = existingTabs.some((tab) => tab.key === key)
      ? existingTabs
      : [
          ...existingTabs,
          {
            key,
            root: "workspace" as const,
            path,
            name: basename(path),
            loading: false,
            dirty: false,
          },
        ];

    params.set("tabs", serializeTabsParam(nextTabs));
    params.set("active", key);
  }

  return `/files?${params.toString()}`;
}

function dirname(path: string): string {
  const segments = path.split("/");
  segments.pop();
  return segments.length === 0 ? "." : segments.join("/");
}

function basename(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? path;
}
