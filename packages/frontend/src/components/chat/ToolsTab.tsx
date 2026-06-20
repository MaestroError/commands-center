import { useMemo } from "react";
import type { Specialist, SpecialistCatalog } from "@cc/shared/schemas";

import { useCustomToolsQuery, useSpecialistCustomToolsQuery } from "@/hooks/use-custom-tools-query";
import { useMcpServersQuery } from "@/hooks/use-mcp-servers-query";
import {
  buildChatToolSummary,
  type CcManagedToolGroup,
  type ChatToolAction,
  type ChatToolContext,
  type ChatToolSummary,
  type CustomToolSummary,
  type ExternalMcpServerSummary,
} from "@/lib/chat-tools";

type ToolsTabProps = {
  agent?: Specialist | null;
  catalog?: SpecialistCatalog;
};

type ToolsTabContentProps = {
  summary: ChatToolSummary;
  loading: boolean;
  errors: string[];
};

export function ToolsTab({ agent, catalog }: ToolsTabProps) {
  const mcpServersQuery = useMcpServersQuery();
  const customToolsQuery = useCustomToolsQuery();
  const specialistCustomToolsQuery = useSpecialistCustomToolsQuery(agent?.id);

  const summary = useMemo(
    () =>
      agent
        ? buildChatToolSummary({
            agent,
            catalog,
            globalCustomTools: customToolsQuery.data ?? catalog?.customTools,
            specialistCustomTools: specialistCustomToolsQuery.data,
            mcpServers: mcpServersQuery.data,
          })
        : { ccManaged: [], customTools: [], externalMcp: [], totalCount: 0 },
    [agent, catalog, customToolsQuery.data, mcpServersQuery.data, specialistCustomToolsQuery.data],
  );

  return (
    <ToolsTabContent
      errors={[
        customToolsQuery.error ? readError(customToolsQuery.error) : "",
        specialistCustomToolsQuery.error ? readError(specialistCustomToolsQuery.error) : "",
        mcpServersQuery.error ? readError(mcpServersQuery.error) : "",
      ].filter(Boolean)}
      loading={
        customToolsQuery.isLoading ||
        specialistCustomToolsQuery.isLoading ||
        mcpServersQuery.isLoading
      }
      summary={summary}
    />
  );
}

export function ToolsTabContent({ summary, loading, errors }: ToolsTabContentProps) {
  if (summary.totalCount === 0 && loading) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-text-secondary">
        Loading tools...
      </div>
    );
  }

  if (summary.totalCount === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-sm text-text-secondary">
        <ToolLoadErrors errors={errors} />
        <p>No tools configured for this specialist.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <ToolLoadErrors errors={errors} />

      {summary.ccManaged.length > 0 ? (
        <ToolSection title="CommandsCenter">
          <div className="grid gap-3">
            {summary.ccManaged.map((group) => (
              <CcManagedToolGroupCard group={group} key={group.serverName} />
            ))}
          </div>
        </ToolSection>
      ) : null}

      {summary.customTools.length > 0 ? (
        <ToolSection title="Custom Tools">
          <div className="grid gap-2">
            {summary.customTools.map((tool) => (
              <CustomToolRow key={tool.slug} tool={tool} />
            ))}
          </div>
        </ToolSection>
      ) : null}

      {summary.externalMcp.length > 0 ? (
        <ToolSection title="External MCP">
          <div className="grid gap-3">
            {summary.externalMcp.map((server) => (
              <ExternalMcpServerCard key={server.serverName} server={server} />
            ))}
          </div>
        </ToolSection>
      ) : null}
    </div>
  );
}

function ToolLoadErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-text-secondary">
      {errors.map((error, index) => (
        <p key={`${String(index)}:${error}`}>{error}</p>
      ))}
    </div>
  );
}

function ToolSection(props: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

function CcManagedToolGroupCard({ group }: { group: CcManagedToolGroup }) {
  return (
    <article className="rounded-md border border-border bg-surface p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-text-primary">{group.serverName}</h4>
            {group.systemManaged ? <SourceBadge label="Default" /> : null}
          </div>
          <p className="mt-1 text-xs text-text-secondary">{group.description}</p>
        </div>
      </div>

      <div className="grid gap-2">
        {group.tools.map((tool) => (
          <div className="rounded-md border border-border bg-background p-2" key={tool.name}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                {tool.name}
              </p>
              <ContextBadge context={tool.context} />
              <ActionBadge action={tool.action} />
            </div>
            <p className="mt-1 text-xs text-text-secondary">{tool.description}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function CustomToolRow({ tool }: { tool: CustomToolSummary }) {
  return (
    <article className="rounded-md border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {tool.name}
        </h4>
        <SourceBadge label={customToolSourceLabel(tool)} />
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        {tool.description || "No description available."}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        <code className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-text-secondary">
          {tool.slug}
        </code>
        {!tool.enabled ? <SourceBadge label="Unavailable" /> : null}
        {tool.status && tool.status !== "matching" ? <SourceBadge label={tool.status} /> : null}
      </div>
    </article>
  );
}

function ExternalMcpServerCard({ server }: { server: ExternalMcpServerSummary }) {
  return (
    <article className="rounded-md border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {server.serverName}
        </h4>
        <ActionBadge action={server.action} />
        {server.globalEnabled === false ? <SourceBadge label="Globally disabled" /> : null}
        {server.runtimeStatus ? (
          <SourceBadge label={runtimeStatusLabel(server.runtimeStatus)} />
        ) : null}
      </div>

      {server.permissionPatterns.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {server.permissionPatterns.map((rule) => (
            <code
              className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-text-secondary"
              key={`${rule.pattern}:${rule.action}`}
            >
              {rule.pattern}: {rule.action}
            </code>
          ))}
        </div>
      ) : null}

      {server.tools.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {server.tools.map((tool) => (
            <div className="rounded-md border border-border bg-background p-2" key={tool.id}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                  {tool.name}
                </p>
                <ActionBadge action={tool.action} />
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                No description available from this MCP server.
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-text-secondary">
          Tool names and descriptions are not available from stored configuration.
        </p>
      )}
    </article>
  );
}

function ActionBadge({ action }: { action: ChatToolAction }) {
  return <SourceBadge label={action === "ask" ? "Ask" : "Allow"} />;
}

function ContextBadge({ context }: { context: ChatToolContext }) {
  const label = context === "task_run" ? "Task run" : context === "both" ? "Both" : "Chat";
  return <SourceBadge label={label} />;
}

function SourceBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-xs text-text-secondary">
      {label}
    </span>
  );
}

function customToolSourceLabel(tool: CustomToolSummary): string {
  if (tool.source === "missing_global") {
    return "Missing";
  }

  return tool.source === "local" ? "Local" : "Managed";
}

function runtimeStatusLabel(
  status: NonNullable<ExternalMcpServerSummary["runtimeStatus"]>,
): string {
  switch (status.status) {
    case "connected":
      return "Connected";
    case "disabled":
      return "Disabled";
    case "needs_auth":
      return "Needs auth";
    case "disconnected":
      return "Disconnected";
    case "needs_client_registration":
      return "Needs client registration";
    case "failed":
      return "Failed";
  }
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load tool details.";
}
