import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  CalendarClock,
  FileCode,
  FilePenLine,
  FileSearch,
  FolderSearch,
  Pencil,
  Search,
  Sparkles,
  SquareCheckBig,
  Wrench,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import type {
  Agent,
  BuiltInSkill,
  CustomTool,
  GlobalSearchWorkspaceFilesResponse,
  Task,
  TaskTemplate,
} from "@cc/shared/schemas";

import {
  getAgentCatalog,
  listAgents,
  listArchivedTasks,
  listCustomTools,
  listTasks,
  listTaskTemplates,
  searchWorkspaceFiles,
} from "@/lib/api";
import { buildFileManagerHref } from "@/lib/file-manager-href";
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
  group: "Agents" | "Tasks" | "Task Templates" | "Custom Tools" | "Skills" | "Files";
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

  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks({ includeArchived: false }),
    queryFn: () => listTasks({ includeArchived: false }),
    enabled: props.open && deferredQuery.length > 0,
  });

  const archivedTasksQuery = useQuery({
    queryKey: queryKeys.taskArchive,
    queryFn: () => listArchivedTasks(),
    enabled: props.open && deferredQuery.length > 0,
  });

  const taskTemplatesQuery = useQuery({
    queryKey: queryKeys.taskTemplates,
    queryFn: () => listTaskTemplates(),
    enabled: props.open && deferredQuery.length > 0,
  });

  const customToolsQuery = useQuery({
    queryKey: queryKeys.customTools,
    queryFn: () => listCustomTools(),
    enabled: props.open && deferredQuery.length > 0,
  });

  const catalogQuery = useQuery({
    queryKey: queryKeys.agentCatalog,
    queryFn: () => getAgentCatalog(),
    enabled: props.open && deferredQuery.length > 0,
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

  const taskResults = useMemo(() => {
    if (deferredQuery.length === 0) {
      return [] satisfies PaletteResult[];
    }

    const agents = agentsQuery.data ?? [];
    const tasks = [...(tasksQuery.data ?? []), ...(archivedTasksQuery.data ?? [])];

    return tasks
      .filter((task) => matchesTask(task, agents, deferredQuery))
      .slice(0, 8)
      .map((task) => buildTaskResult(task, agents, navigate, props.onClose));
  }, [
    agentsQuery.data,
    archivedTasksQuery.data,
    deferredQuery,
    navigate,
    props.onClose,
    tasksQuery.data,
  ]);

  const taskTemplateResults = useMemo(() => {
    if (deferredQuery.length === 0) {
      return [] satisfies PaletteResult[];
    }

    const agents = agentsQuery.data ?? [];

    return (taskTemplatesQuery.data ?? [])
      .filter((template) => matchesTaskTemplate(template, agents, deferredQuery))
      .slice(0, 8)
      .map((template) => buildTaskTemplateResult(template, agents, navigate, props.onClose));
  }, [agentsQuery.data, deferredQuery, navigate, props.onClose, taskTemplatesQuery.data]);

  const customToolResults = useMemo(() => {
    if (deferredQuery.length === 0) {
      return [] satisfies PaletteResult[];
    }

    return (customToolsQuery.data ?? [])
      .filter((tool) => matchesCustomTool(tool, deferredQuery))
      .slice(0, 8)
      .map((tool) => buildCustomToolResult(tool, navigate, props.onClose));
  }, [customToolsQuery.data, deferredQuery, navigate, props.onClose]);

  const skillResults = useMemo(() => {
    if (deferredQuery.length === 0) {
      return [] satisfies PaletteResult[];
    }

    const skills = [
      ...(catalogQuery.data?.builtInSkills ?? []).map((skill) => ({
        source: "built-in" as const,
        skill,
      })),
      ...(catalogQuery.data?.workspaceSkills ?? []).map((skill) => ({
        source: "workspace" as const,
        skill,
      })),
    ];

    return skills
      .filter((entry) => matchesSkill(entry.skill, entry.source, deferredQuery))
      .slice(0, 8)
      .map((entry) => buildSkillResult(entry.skill, entry.source, navigate, props.onClose));
  }, [catalogQuery.data, deferredQuery, navigate, props.onClose]);

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

  const results = [
    ...agentResults,
    ...taskResults,
    ...taskTemplateResults,
    ...customToolResults,
    ...skillResults,
    ...fileResults,
  ];
  const isLoading =
    agentsQuery.isLoading ||
    tasksQuery.isLoading ||
    archivedTasksQuery.isLoading ||
    taskTemplatesQuery.isLoading ||
    customToolsQuery.isLoading ||
    catalogQuery.isLoading ||
    fileQuery.isLoading;

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
              placeholder="Search workspace resources"
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
            <EmptyState message="Search agents, tasks, custom tools, skills, and workspace files." />
          ) : isLoading ? (
            <EmptyState message="Searching resources..." />
          ) : results.length === 0 ? (
            <EmptyState message="No matching resources." />
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

function buildTaskResult(
  task: Task,
  agents: Agent[],
  navigate: ReturnType<typeof useNavigate>,
  onClose: () => void,
) {
  const agentName = readAgentName(agents, task.agentId);
  const status = formatToken(task.status);
  const openTask = () => {
    void navigate(`/tasks/${encodeURIComponent(task.id)}`);
    onClose();
  };

  return {
    id: `task:${task.id}`,
    group: "Tasks",
    title: task.title,
    subtitle: `${agentName} · ${status}${task.archived ? " · Archived" : ""}`,
    markerIcon: <SquareCheckBig className="h-4 w-4" />,
    markerLabel: task.archived ? "Archived task" : "Task",
    primaryAction: openTask,
    secondaryActions: [
      {
        label: "Edit task",
        icon: <Pencil className="h-4 w-4" />,
        onSelect: () => {
          void navigate(`/tasks/${encodeURIComponent(task.id)}/edit`);
          onClose();
        },
      },
    ],
  } satisfies PaletteResult;
}

function buildTaskTemplateResult(
  template: TaskTemplate,
  agents: Agent[],
  navigate: ReturnType<typeof useNavigate>,
  onClose: () => void,
) {
  const agentName = readAgentName(agents, template.defaultAgentId);

  return {
    id: `task-template:${template.id}`,
    group: "Task Templates",
    title: template.title,
    subtitle: `${agentName} · ${template.recurrence ? "Recurring" : "Manual"} template`,
    markerIcon: <CalendarClock className="h-4 w-4" />,
    markerLabel: "Task template",
    primaryAction: () => {
      void navigate(`/tasks?view=templates&template=${encodeURIComponent(template.id)}`);
      onClose();
    },
    secondaryActions: [
      {
        label: "Edit task template",
        icon: <Pencil className="h-4 w-4" />,
        onSelect: () => {
          void navigate(`/tasks/templates/${encodeURIComponent(template.id)}/edit`);
          onClose();
        },
      },
    ],
  } satisfies PaletteResult;
}

function buildCustomToolResult(
  tool: CustomTool,
  navigate: ReturnType<typeof useNavigate>,
  onClose: () => void,
) {
  const openSource = () => {
    const params = new URLSearchParams({
      root: "workspace",
      path: `custom-tools/${tool.slug}`,
      select: `custom-tools/${tool.slug}/${tool.entryFile}`,
    });
    void navigate(`/files?${params.toString()}`);
    onClose();
  };

  return {
    id: `custom-tool:${tool.slug}`,
    group: "Custom Tools",
    title: tool.name,
    subtitle: `${tool.slug} · ${tool.enabled ? "Enabled" : "Disabled"}`,
    markerIcon: <Wrench className="h-4 w-4" />,
    markerLabel: "Custom tool",
    primaryAction: openSource,
    secondaryActions: [
      {
        label: "Open tools page",
        icon: <FileCode className="h-4 w-4" />,
        onSelect: () => {
          void navigate("/tools");
          onClose();
        },
      },
    ],
  } satisfies PaletteResult;
}

function buildSkillResult(
  skill: BuiltInSkill,
  source: "built-in" | "workspace",
  navigate: ReturnType<typeof useNavigate>,
  onClose: () => void,
) {
  const openSkill = () => {
    if (source === "workspace") {
      const params = new URLSearchParams({
        root: "workspace",
        path: `skills/${skill.slug}`,
        select: `skills/${skill.slug}/SKILL.md`,
      });
      void navigate(`/files?${params.toString()}`);
    } else {
      const params = new URLSearchParams({ skill: `${source}:${skill.slug}` });
      void navigate(`/skills?${params.toString()}`);
    }
    onClose();
  };

  return {
    id: `skill:${source}:${skill.slug}`,
    group: "Skills",
    title: skill.name,
    subtitle: `${formatToken(source)} · ${skill.category}`,
    markerIcon: <Sparkles className="h-4 w-4" />,
    markerLabel: "Skill",
    primaryAction: openSkill,
    secondaryActions: [
      {
        label: "Open skills library",
        icon: <FolderSearch className="h-4 w-4" />,
        onSelect: () => {
          const params = new URLSearchParams({ skill: `${source}:${skill.slug}` });
          void navigate(`/skills?${params.toString()}`);
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
          buildFileManagerHref({
            path: entry.path,
            currentPathname: props.currentPathname,
            currentSearch: props.locationSearch,
            openInEditor: true,
          }),
        );
        props.onClose();
      };
      const showLocation = () => {
        void props.navigate(
          buildFileManagerHref({
            path: entry.path,
            currentPathname: props.currentPathname,
            currentSearch: props.locationSearch,
          }),
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

function matchesTask(task: Task, agents: Agent[], query: string): boolean {
  const agent = agents.find((entry) => entry.id === task.agentId);
  const values = [
    task.title,
    task.description,
    task.agentId,
    agent?.name,
    task.status,
    formatToken(task.status),
    task.archived ? "archived" : undefined,
    task.sourceTemplateId ? "generated template" : undefined,
    task.scheduledAt || task.scheduledFor ? "scheduled" : undefined,
    task.dueAt ? "due" : undefined,
    task.context.text,
    task.latestFinalMessage,
    ...task.todos.map((todo) => todo.content),
  ];

  return normalizeSearchText(values.filter(Boolean).join(" ")).includes(normalizeSearchText(query));
}

function matchesTaskTemplate(template: TaskTemplate, agents: Agent[], query: string): boolean {
  const agent = agents.find((entry) => entry.id === template.defaultAgentId);
  const values = [
    template.title,
    template.description,
    template.defaultAgentId,
    agent?.name,
    "template",
    template.recurrence ? "repeating recurring scheduled" : "manual template",
    template.enabled ? "enabled" : "disabled",
    template.latestTaskId ? "generated latest task" : undefined,
    ...template.todos.map((todo) => todo.content),
  ];

  return normalizeSearchText(values.filter(Boolean).join(" ")).includes(normalizeSearchText(query));
}

function matchesCustomTool(tool: CustomTool, query: string): boolean {
  const values = [tool.name, tool.slug, tool.description, tool.entryFile, tool.entryPath];

  return normalizeSearchText(values.join(" ")).includes(normalizeSearchText(query));
}

function matchesSkill(
  skill: BuiltInSkill,
  source: "built-in" | "workspace",
  query: string,
): boolean {
  const values = [
    skill.name,
    skill.slug,
    skill.description,
    skill.category,
    source,
    ...skill.files,
    ...Object.values(skill.metadata),
  ];

  return normalizeSearchText(values.join(" ")).includes(normalizeSearchText(query));
}

function readAgentName(agents: Agent[], agentId: string): string {
  return agents.find((agent) => agent.id === agentId)?.name ?? agentId;
}

function formatToken(value: string): string {
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]/g, " ");
}
