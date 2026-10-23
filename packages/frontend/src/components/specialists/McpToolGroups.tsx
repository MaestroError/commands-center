import { resolveMcpToolDefault } from "@cc/shared/schemas";
import type {
  McpToolCatalog,
  SpecialistCapabilitySelection,
  TaskPermissionProfile,
} from "@cc/shared/schemas";
import { PermissionControl } from "./PermissionControl";

type Rules = NonNullable<TaskPermissionProfile["mcpToolPermissions"]>;
export function McpToolGroups(props: {
  catalog?: McpToolCatalog;
  error?: string;
  capabilities?: Partial<SpecialistCapabilitySelection>;
  rules?: Rules;
  taskMode?: boolean;
  embedded?: boolean;
  onChange: (rules: Rules) => void;
}) {
  const catalog = props.catalog ?? [];
  const servers = [
    ...new Set([
      ...catalog.map((entry) => entry.server),
      ...(props.rules ?? []).map((entry) => entry.server),
    ]),
  ];
  const options = [
    {
      value: "allow" as const,
      label: "Allow",
      selectedClassName: "border-success-border bg-success-surface text-success-foreground",
    },
    ...(!props.taskMode
      ? [
          {
            value: "ask" as const,
            label: "Ask",
            selectedClassName: "border-warning-border bg-warning-surface text-warning-foreground",
          },
        ]
      : []),
    {
      value: "deny" as const,
      label: "Deny",
      selectedClassName: "border-danger-border bg-danger-surface text-danger-foreground",
    },
  ];
  return (
    <div className="grid gap-4">
      {!props.embedded ? <h3 className="font-semibold text-text-primary">MCP tools</h3> : null}
      {props.error ? (
        <p role="alert" className="text-sm text-danger">
          {props.error}
        </p>
      ) : null}
      {servers.length === 0 ? (
        <p className="text-sm text-text-secondary">
          No connected MCP tools. Configure connections on the specialist first.
        </p>
      ) : null}
      {servers.map((server) => {
        const group = catalog.find((entry) => entry.server === server);
        const tools = [
          ...new Set([
            ...(group?.tools.map((entry) => entry.name) ?? []),
            ...(props.rules ?? [])
              .filter((entry) => entry.server === server)
              .map((entry) => entry.tool),
          ]),
        ];
        const Group = props.embedded ? "section" : "details";
        return (
          <Group
            open={props.embedded ? undefined : !props.taskMode}
            key={server}
            className={
              props.embedded ? "grid gap-3" : "grid gap-3 rounded-xl border border-border p-4"
            }
          >
            {!props.embedded ? (
              <summary className="cursor-pointer font-medium text-text-primary">
                {server} tools
              </summary>
            ) : null}
            <div className="mt-3 grid gap-3">
              {tools.length === 0 ? (
                <p className="text-sm text-text-secondary">
                  {group?.available ? "No tools registered." : "Unavailable"}
                </p>
              ) : null}
              {tools.map((tool) => {
                const metadata = group?.tools.find((entry) => entry.name === tool);
                const available = group?.available && metadata;
                const rule = props.rules?.find(
                  (entry) => entry.server === server && entry.tool === tool,
                );
                let action =
                  rule?.action ??
                  (props.taskMode && props.rules
                    ? "deny"
                    : metadata
                      ? resolveMcpToolDefault(props.capabilities, server, metadata)
                      : "deny");
                if (props.taskMode && action === "ask") action = "allow";
                return (
                  <div
                    key={tool}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-text-primary">{tool}</p>
                      <p className="text-sm text-text-secondary">{metadata?.description}</p>
                    </div>
                    {available ? (
                      <PermissionControl
                        label={`${server} ${tool}`}
                        value={action}
                        options={options}
                        onChange={(next) =>
                          props.onChange([
                            ...(props.rules ?? []).filter(
                              (entry) => entry.server !== server || entry.tool !== tool,
                            ),
                            { server, tool, action: next },
                          ])
                        }
                      />
                    ) : (
                      <span className="text-sm text-text-secondary">Unavailable · {action}</span>
                    )}
                    {!available && rule ? (
                      <button
                        type="button"
                        className="text-sm text-text-secondary underline"
                        onClick={() =>
                          props.onChange((props.rules ?? []).filter((entry) => entry !== rule))
                        }
                      >
                        Remove saved permission
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Group>
        );
      })}
    </div>
  );
}
