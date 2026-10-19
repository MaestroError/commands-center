import { Switch } from "@/components/common/Switch";
import { EmptyState } from "@/components/common/PageStates";
import { getAppMcpServerAction, getAppMcpToolAction } from "@/lib/specialist-capabilities";
import type {
  SpecialistCatalog,
  SpecialistCapabilitySelection,
  AppMcpToolContext,
} from "@cc/shared/schemas";

type PermissionAction = "allow" | "ask" | "deny";

export function CcToolGroups(props: {
  groups: SpecialistCatalog["appMcpServers"];
  capabilities: SpecialistCapabilitySelection;
  taskMode?: boolean;
  onGroupChange: (name: string, action: PermissionAction) => void;
  onToolChange: (group: string, tool: string, enabled: boolean) => void;
}) {
  return (
    <>
      {(props.groups.length ?? 0) > 0 ? (
        <div className="grid gap-4">
          {props.groups.map((server) => {
            const serverAction = getAppMcpServerAction(props.capabilities, server.name);

            return (
              <article className="rounded-xl border border-border bg-surface p-4" key={server.name}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-text-primary">{server.name}</h3>
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
                        CC-managed
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-text-secondary">{server.description}</p>
                  </div>

                  {!props.taskMode ? (
                    <AppMcpServerPermissionControl
                      label={server.name}
                      onChange={(action) => props.onGroupChange(server.name, action)}
                      value={serverAction}
                    />
                  ) : null}
                </div>

                {(props.taskMode || serverAction !== "deny") && server.tools.length > 0 ? (
                  <div className="mt-4 grid gap-3">
                    {server.tools.map((tool) => {
                      const toolEnabled = props.taskMode
                        ? props.capabilities.appToolPermissions?.find(
                            (rule) => rule.pattern === `${server.name}_${tool.name}`,
                          )?.action === "allow"
                        : getAppMcpToolAction(props.capabilities, server.name, tool.name) ===
                          "allow";

                      return (
                        <div
                          className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 md:flex-row md:items-start md:justify-between"
                          key={tool.name}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-text-primary">{tool.name}</p>
                              <ToolContextBadge context={tool.context} />
                            </div>
                            <p className="mt-1 text-sm text-text-secondary">{tool.description}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Switch
                              aria-label={`${server.name} ${tool.name}`}
                              checked={toolEnabled}
                              onChange={(enabled) =>
                                props.onToolChange(server.name, tool.name, enabled)
                              }
                            />
                            <span className="text-xs text-text-secondary">
                              {props.taskMode
                                ? toolEnabled
                                  ? "Allow"
                                  : "Deny"
                                : toolEnabled
                                  ? "Enabled"
                                  : "Disabled"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div>
          <EmptyState
            description="No CommandsCenter tool groups are registered in this build."
            title="No CC-managed tools available"
          />
        </div>
      )}
    </>
  );
}

function AppMcpServerPermissionControl(props: {
  label: string;
  value: PermissionAction;
  onChange: (action: PermissionAction) => void;
}) {
  const options = [
    {
      value: "deny" as const,
      label: "Disabled",
      selectedClassName: "border-danger-border bg-danger-surface text-danger-foreground",
    },
    {
      value: "ask" as const,
      label: "Ask",
      selectedClassName: "border-warning-border bg-warning-surface text-warning-foreground",
    },
    {
      value: "allow" as const,
      label: "Allow",
      selectedClassName: "border-success-border bg-success-surface text-success-foreground",
    },
  ];

  return (
    <div className="inline-flex rounded-xl border border-border bg-surface p-1">
      {options.map((option) => {
        const selected = props.value === option.value;

        return (
          <button
            aria-label={`${props.label} ${option.label}`}
            aria-pressed={selected}
            className={
              selected
                ? `rounded-lg border px-3 py-1.5 text-xs font-medium transition ${option.selectedClassName}`
                : "rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
            }
            key={option.value}
            onClick={() => props.onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ToolContextBadge(props: { context: AppMcpToolContext }) {
  const label = {
    chat: "Chat",
    task_run: "Task run",
    both: "Chat + task",
  }[props.context];

  return (
    <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-text-secondary">
      {label}
    </span>
  );
}
