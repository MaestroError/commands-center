// Split out of IntegrationsPage.tsx (issue #99).

import { getMcpServerSelection, setMcpServerEnabled } from "@/lib/specialist-capabilities";
import type {
  McpServer,
  Specialist,
  SpecialistCapabilitySelection,
  UpdateSpecialistInput,
} from "@cc/shared/schemas";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";

export type DialogState =
  | { mode: "create"; prefill?: FormState }
  | {
      mode: "edit";
      server: McpServer;
    };

export type FormState = {
  name: string;
  url: string;
  transport: "streamable-http" | "sse" | "stdio";
  authMethod: "none" | "oauth" | "headers";
  headersText: string;
  commandText: string;
  environmentText: string;
};

export type FormErrors = Partial<Record<keyof FormState, string>>;

export type SuggestedMcpServer = {
  id: string;
  name: string;
  description: string;
  authBadge: string;
  tags: string[];
  form: FormState;
};

const EMPTY_FORM_BASE = {
  url: "",
  headersText: "",
  commandText: "",
  environmentText: "",
} as const;

export const CONFIGURED_SECTION_STORAGE_KEY = "cc-integrations-configured-expanded";

export const SUGGESTED_SECTION_STORAGE_KEY = "cc-integrations-suggested-expanded";

export const SUGGESTED_SHOW_ALL_STORAGE_KEY = "cc-integrations-suggested-show-all";

export const COMPOSIO_SERVER_URL = "https://connect.composio.dev/mcp";

export const COMPOSIO_API_KEY_HEADER = "x-consumer-api-key";

export const DEFAULT_COMPOSIO_NAME = "composio";

export const SUGGESTED_MCP_SERVERS: SuggestedMcpServer[] = [
  {
    id: "notion",
    name: "Notion",
    description: "Pages, databases, and project docs in sync.",
    authBadge: "OAuth",
    tags: ["auth:oauth", "category:productivity", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "notion",
      url: "https://mcp.notion.com/mcp",
      transport: "streamable-http",
      authMethod: "oauth",
    },
  },
  {
    id: "context7",
    name: "Context7",
    description: "Search product docs with richer context.",
    authBadge: "API key",
    tags: ["auth:api-key", "category:documentation", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "context7",
      url: "https://mcp.context7.com/mcp",
      transport: "streamable-http",
      authMethod: "headers",
      headersText: "CONTEXT7_API_KEY: {env:CONTEXT7_API_KEY}",
    },
  },
  {
    id: "github",
    name: "GitHub",
    description: "Issues, pull requests, and repo automation.",
    authBadge: "PAT",
    tags: ["auth:pat", "category:dev-tools", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "github",
      url: "https://api.githubcopilot.com/mcp/",
      transport: "streamable-http",
      authMethod: "headers",
      headersText: "Authorization: Bearer {env:GITHUB_TOKEN}",
    },
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Privacy-first web search via Brave's API.",
    authBadge: "API key",
    tags: [
      "auth:api-key",
      "category:search",
      "language:node",
      "launcher:npx",
      "type:local",
      "source:official",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "brave-search",
      transport: "stdio",
      authMethod: "none",
      commandText: "npx\n-y\n@brave/brave-search-mcp-server",
      environmentText: "BRAVE_API_KEY={env:BRAVE_API_KEY}",
    },
  },
  {
    id: "linear",
    name: "Linear",
    description: "Issues, projects, and cycles via Linear's official MCP.",
    authBadge: "OAuth",
    tags: ["auth:oauth", "category:productivity", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "linear",
      url: "https://mcp.linear.app/mcp",
      transport: "streamable-http",
      authMethod: "oauth",
    },
  },
  {
    id: "jira",
    name: "Jira",
    description: "Jira issues and Confluence pages via Atlassian's Remote MCP (Rovo).",
    authBadge: "OAuth",
    tags: ["auth:oauth", "category:productivity", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "jira",
      url: "https://mcp.atlassian.com/v1/mcp",
      transport: "streamable-http",
      authMethod: "oauth",
    },
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Inspect errors, releases, and performance issues.",
    authBadge: "OAuth",
    tags: ["auth:oauth", "category:monitoring", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "sentry",
      url: "https://mcp.sentry.dev/mcp",
      transport: "streamable-http",
      authMethod: "oauth",
    },
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Deployments, projects, and logs from Vercel.",
    authBadge: "OAuth",
    tags: ["auth:oauth", "category:deployment", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "vercel",
      url: "https://mcp.vercel.com",
      transport: "streamable-http",
      authMethod: "oauth",
    },
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Project, database, and storage operations on Supabase.",
    authBadge: "OAuth",
    tags: ["auth:oauth", "category:database", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "supabase",
      url: "https://mcp.supabase.com/mcp",
      transport: "streamable-http",
      authMethod: "oauth",
    },
  },
  {
    id: "n8n",
    name: "n8n",
    description: "Trigger workflows and tools from your n8n instance. Set your instance URL.",
    authBadge: "Token",
    tags: ["auth:token", "category:automation", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "n8n",
      // Placeholder — users replace the host with their own n8n instance URL.
      url: "https://your-n8n-instance.com/mcp-server/http",
      transport: "streamable-http",
      authMethod: "headers",
      headersText: "Authorization: Bearer {env:N8N_MCP_TOKEN}",
    },
  },
  {
    id: "playwright",
    name: "Playwright",
    description: "Microsoft's official browser automation via accessibility tree.",
    authBadge: "No Auth",
    tags: [
      "auth:no-auth",
      "category:browser",
      "language:node",
      "launcher:npx",
      "type:local",
      "source:official",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "playwright",
      transport: "stdio",
      authMethod: "none",
      commandText: "npx\n-y\n@playwright/mcp@latest\n--headless\n--browser\nchromium",
    },
  },
  {
    id: "antv-chart",
    name: "AntV Charts",
    description: "Generate 25+ chart types (line, bar, pie, sankey, treemap, mind map).",
    authBadge: "No Auth",
    tags: [
      "auth:no-auth",
      "category:charts",
      "language:node",
      "launcher:npx",
      "type:local",
      "source:official",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "antv-chart",
      transport: "stdio",
      authMethod: "none",
      commandText: "npx\n-y\n@antv/mcp-server-chart",
    },
  },
  {
    id: "mermaid",
    name: "Mermaid",
    description: "Render Mermaid diagrams (flowcharts, sequence, ER, gantt, class).",
    authBadge: "No Auth",
    tags: [
      "auth:no-auth",
      "category:diagrams",
      "language:node",
      "launcher:npx",
      "type:local",
      "source:community",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "mermaid",
      transport: "stdio",
      authMethod: "none",
      commandText: "npx\n-y\nmcp-mermaid",
    },
  },
  {
    id: "fetcher",
    name: "Fetcher",
    description: "Playwright-based web fetcher with JS rendering, returns clean Markdown.",
    authBadge: "No Auth",
    tags: [
      "auth:no-auth",
      "category:web-fetching",
      "language:node",
      "launcher:npx",
      "type:local",
      "source:community",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "fetcher",
      transport: "stdio",
      authMethod: "none",
      commandText: "npx\n-y\nfetcher-mcp",
    },
  },
  {
    id: "markitdown",
    name: "MarkItDown",
    description: "Convert PDF, DOCX, PPTX, XLSX, images, and audio to Markdown (Microsoft).",
    authBadge: "No Auth",
    tags: [
      "auth:no-auth",
      "category:documents",
      "language:python",
      "launcher:uvx",
      "type:local",
      "source:official",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "markitdown",
      transport: "stdio",
      authMethod: "none",
      commandText: "uvx\nmarkitdown-mcp",
    },
  },
  {
    id: "duckduckgo",
    name: "DuckDuckGo",
    description: "Free web search with no API key required.",
    authBadge: "No Auth",
    tags: [
      "auth:no-auth",
      "category:search",
      "language:python",
      "launcher:uvx",
      "type:local",
      "source:community",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "duckduckgo",
      transport: "stdio",
      authMethod: "none",
      commandText: "uvx\nduckduckgo-mcp-server",
    },
  },
  {
    id: "memory",
    name: "Memory",
    description: "Persistent knowledge graph stored locally. Anthropic reference implementation.",
    authBadge: "No Auth",
    tags: [
      "auth:no-auth",
      "category:memory",
      "language:node",
      "launcher:npx",
      "type:local",
      "source:reference",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "memory",
      transport: "stdio",
      authMethod: "none",
      commandText: "npx\n-y\n@modelcontextprotocol/server-memory",
    },
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description: "Structured step-by-step reasoning helper. Anthropic reference implementation.",
    authBadge: "No Auth",
    tags: [
      "auth:no-auth",
      "category:reasoning",
      "language:node",
      "launcher:npx",
      "type:local",
      "source:reference",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "sequential-thinking",
      transport: "stdio",
      authMethod: "none",
      commandText: "npx\n-y\n@modelcontextprotocol/server-sequential-thinking",
    },
  },
];

export function buildSuggestedMcpForm(
  suggestion: SuggestedMcpServer,
  isDocker: boolean,
): FormState {
  if (!isDocker || suggestion.id !== "mermaid") {
    return suggestion.form;
  }

  return {
    ...suggestion.form,
    environmentText: [
      "npm_config_cache=/workspace/.cc/npm-cache",
      "npm_config_ignore_scripts=true",
      "PLAYWRIGHT_BROWSERS_PATH=/ms-playwright",
    ].join("\n"),
  };
}

export function friendlyStatus(status: { status: string }): string {
  switch (status.status) {
    case "connected":
      return "Connected";
    case "needs_auth":
      return "Needs auth";
    case "needs_client_registration":
      return "Needs registration";
    case "failed":
      return "Error";
    case "disabled":
      return "Disabled";
    default:
      return "Disconnected";
  }
}

export function statusBadgeVariant(status: {
  status: string;
}): "success" | "warning" | "danger" | "neutral" {
  switch (status.status) {
    case "connected":
      return "success";
    case "needs_auth":
    case "needs_client_registration":
      return "warning";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

export function createForm(server?: McpServer): FormState {
  const cfg = server?.config;

  return {
    name: server?.name ?? "",
    url: !cfg || cfg.transport === "stdio" ? "" : cfg.url,
    transport: cfg?.transport ?? "streamable-http",
    authMethod: !cfg || cfg.transport === "stdio" ? "none" : cfg.authMethod,
    headersText:
      !cfg || cfg.transport === "stdio"
        ? ""
        : cfg.headers
            .map((header: { key: string; value: string }) => `${header.key}: ${header.value}`)
            .join("\n"),
    commandText: !cfg || cfg.transport !== "stdio" ? "" : cfg.command.join("\n"),
    environmentText:
      !cfg || cfg.transport !== "stdio"
        ? ""
        : Object.entries(cfg.environment)
            .map(([key, value]) => `${key}=${value}`)
            .join("\n"),
  };
}

export function buildDuplicateForm(server: McpServer, existingNames: string[]): FormState {
  return {
    ...createForm(server),
    name: suggestUniqueName(server.name, existingNames),
  };
}

// Suggests a non-colliding copy name like `github` -> `github-2` -> `github-3`,
// reusing an existing numeric suffix instead of stacking them (`github-2-2`).

function suggestUniqueName(base: string, existingNames: string[]): string {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  const trimmed = base.trim();
  const suffixMatch = /^(.*?)-(\d+)$/.exec(trimmed);
  const stem = suffixMatch ? suffixMatch[1] : trimmed;
  let counter = suffixMatch ? Number(suffixMatch[2]) + 1 : 2;
  let candidate = `${stem}-${counter}`;

  while (taken.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${stem}-${counter}`;
  }

  return candidate;
}

export function isComposioServer(server: McpServer): boolean {
  return server.config.transport !== "stdio" && server.config.url === COMPOSIO_SERVER_URL;
}

export function validateForm(form: FormState, reservedNames: string[] = []): FormErrors {
  const trimmedName = form.name.trim();
  const nameTaken =
    trimmedName.length > 0 &&
    reservedNames.some((name) => name.toLowerCase() === trimmedName.toLowerCase());

  return {
    name: !trimmedName
      ? "Name is required."
      : nameTaken
        ? `An MCP server named '${trimmedName}' already exists.`
        : undefined,
    url:
      form.transport === "stdio"
        ? undefined
        : isValidUrl(form.url.trim())
          ? undefined
          : "A valid URL is required.",
    transport: form.transport ? undefined : "Transport is required.",
    authMethod:
      form.transport === "stdio" || form.authMethod ? undefined : "Auth method is required.",
    headersText: form.transport === "stdio" ? undefined : validateHeaders(form.headersText),
    commandText:
      form.transport !== "stdio" || parseCommandError(form.commandText) === undefined
        ? undefined
        : parseCommandError(form.commandText),
    environmentText:
      form.transport !== "stdio" || parseEnvironmentError(form.environmentText) === undefined
        ? undefined
        : parseEnvironmentError(form.environmentText),
  };
}

export function describeConfig(server: McpServer): string {
  if (server.config.transport === "stdio") {
    return server.config.command.join(" ");
  }

  return server.config.url;
}

function validateHeaders(value: string): string | undefined {
  try {
    parseHeaders(value);
    return undefined;
  } catch (error) {
    return readError(error);
  }
}

export function parseHeaders(value: string): Array<{ key: string; value: string }> {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(":");
      if (separator <= 0) {
        throw new Error("Headers must use 'Key: Value' format.");
      }

      const key = line.slice(0, separator).trim();
      const headerValue = line.slice(separator + 1).trim();
      if (!key || !headerValue) {
        throw new Error("Headers must use 'Key: Value' format.");
      }

      return { key, value: headerValue };
    });
}

export function parseCommand(value: string): string[] {
  const command = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (command.length === 0) {
    throw new Error("At least one command segment is required.");
  }

  return command;
}

function parseCommandError(value: string): string | undefined {
  try {
    parseCommand(value);
    return undefined;
  } catch (error) {
    return readError(error);
  }
}

export function parseEnvironment(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator <= 0) {
          throw new Error("Environment entries must use 'KEY=value' format.");
        }

        const key = line.slice(0, separator).trim();
        const envValue = line.slice(separator + 1).trim();
        if (!key) {
          throw new Error("Environment entries must use 'KEY=value' format.");
        }

        return [key, envValue] as const;
      }),
  );
}

function parseEnvironmentError(value: string): string | undefined {
  try {
    parseEnvironment(value);
    return undefined;
  } catch (error) {
    return readError(error);
  }
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Request failed.";
}

export function extractEnvRefs(value: string): string[] {
  const matches = value.matchAll(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g);
  return [...new Set(Array.from(matches, (match) => match[1] ?? "").filter(Boolean))];
}

export async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value).catch(() => undefined);
}

export async function syncAgentAssignments(options: {
  agents: Specialist[];
  selectedAgentIds: string[];
  previousServerName?: string;
  nextServerName: string;
  mutateAgent: (input: { id: string; input: UpdateSpecialistInput }) => Promise<Specialist>;
}) {
  const selectedIds = new Set(options.selectedAgentIds);
  const previousServerName = options.previousServerName;

  const updates = options.agents.flatMap((agent) => {
    const hadPreviousAssignment = previousServerName
      ? Boolean(getMcpServerSelection(agent.capabilities, previousServerName)?.enabled)
      : false;
    const wantsAssignment = selectedIds.has(agent.id);

    if (!hadPreviousAssignment && !wantsAssignment) {
      return [];
    }

    let nextCapabilities: SpecialistCapabilitySelection = agent.capabilities;

    if (previousServerName && previousServerName !== options.nextServerName) {
      nextCapabilities = setMcpServerEnabled(nextCapabilities, previousServerName, false);
    }

    nextCapabilities = setMcpServerEnabled(
      nextCapabilities,
      options.nextServerName,
      wantsAssignment,
    );

    if (JSON.stringify(nextCapabilities) === JSON.stringify(agent.capabilities)) {
      return [];
    }

    return [
      options.mutateAgent({
        id: agent.id,
        input: {
          capabilities: nextCapabilities,
        },
      }),
    ];
  });

  await Promise.all(updates);
}

export function buildAssignmentMessage(baseMessage: string, assignedAgentCount: number): string {
  return assignedAgentCount > 0
    ? `${baseMessage} Enabled for ${assignedAgentCount} specialist${assignedAgentCount === 1 ? "" : "s"}.`
    : baseMessage;
}

export const SEARCH_SUGGESTIONS = [
  "no-auth",
  "oauth",
  "official",
  "remote",
  "local",
  "search",
  "browser",
  "reasoning",
] as const;

const TAG_PREFIX_STYLES: Record<string, string> = {
  auth: "bg-badge-neutral-surface text-badge-neutral-foreground",
  category: "bg-badge-neutral-surface text-badge-neutral-foreground",
  language: "bg-badge-neutral-surface text-badge-neutral-foreground",
  launcher: "bg-badge-neutral-surface text-badge-neutral-foreground",
  type: "bg-badge-neutral-surface text-badge-neutral-foreground",
  source: "bg-badge-neutral-surface text-badge-neutral-foreground",
};

const DEFAULT_TAG_STYLE = "bg-surface-elevated text-text-secondary";

export function tagStyle(tag: string): string {
  const idx = tag.indexOf(":");
  const prefix = idx === -1 ? tag : tag.slice(0, idx);
  return TAG_PREFIX_STYLES[prefix] ?? DEFAULT_TAG_STYLE;
}

export function tagLabel(tag: string): string {
  const idx = tag.indexOf(":");
  return idx === -1 ? tag : tag.slice(idx + 1);
}

export function usePersistentBooleanState(
  storageKey: string,
  defaultValue: boolean,
): readonly [boolean, Dispatch<SetStateAction<boolean>>] {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === null) {
        return defaultValue;
      }

      return stored === "true";
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, value ? "true" : "false");
    } catch {
      // Ignore storage errors
    }
  }, [storageKey, value]);

  return [value, setValue] as const;
}

export function useResponsiveSuggestionCount(): number {
  const [count, setCount] = useState(getResponsiveSuggestionCount);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const largeQuery = window.matchMedia("(min-width: 1280px)");
    const mediumQuery = window.matchMedia("(min-width: 768px)");
    const updateCount = () => setCount(getResponsiveSuggestionCount());

    updateCount();
    largeQuery.addEventListener("change", updateCount);
    mediumQuery.addEventListener("change", updateCount);

    return () => {
      largeQuery.removeEventListener("change", updateCount);
      mediumQuery.removeEventListener("change", updateCount);
    };
  }, []);

  return count;
}

function getResponsiveSuggestionCount(): number {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return 1;
  }

  if (window.matchMedia("(min-width: 1280px)").matches) {
    return 3;
  }

  if (window.matchMedia("(min-width: 768px)").matches) {
    return 2;
  }

  return 1;
}
