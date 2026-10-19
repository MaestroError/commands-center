import { Switch } from "@/components/common/Switch";
import { CcToolGroups } from "@/components/specialists/CcToolGroups";
import type { Specialist, SpecialistCatalog, TaskPermissionProfile } from "@cc/shared/schemas";

export function TaskToolPermissions(props: {
  specialist?: Specialist;
  catalog?: SpecialistCatalog;
  value?: TaskPermissionProfile;
  onChange: (profile: TaskPermissionProfile) => void;
}) {
  const groups = (props.catalog?.ccManagedMcpServers ?? props.catalog?.appMcpServers ?? [])
    .map((group) => ({ ...group, tools: group.tools.filter((tool) => tool.context !== "chat") }))
    .filter((group) => group.tools.length > 0);
  const enabled =
    props.value?.appToolPermissions !== undefined || props.value?.appMcpServers !== undefined;
  const inherited = {
    appMcpServers: props.value?.appMcpServers ?? props.specialist?.capabilities.appMcpServers,
    appToolPermissions:
      props.value?.appToolPermissions ?? props.specialist?.capabilities.appToolPermissions,
  };
  const rules =
    props.value?.appToolPermissions ??
    groups.flatMap((group) => {
      const selection = inherited.appMcpServers?.find((entry) => entry.name === group.name);
      const groupEnabled = selection
        ? selection.enabled !== false && selection.action !== "deny"
        : group.enabledByDefault;
      return group.tools.map((tool) => {
        const pattern = `${group.name}_${tool.name}`;
        const rule = inherited.appToolPermissions?.find((entry) => entry.pattern === pattern);
        return {
          pattern,
          action: groupEnabled && rule?.action !== "deny" ? ("allow" as const) : ("deny" as const),
        };
      });
    });
  function save(nextRules: NonNullable<TaskPermissionProfile["appToolPermissions"]>) {
    props.onChange({ ...props.value, appMcpServers: undefined, appToolPermissions: nextRules });
  }
  return (
    <section className="grid gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-text-primary">Change available tools</h2>
          <p className="mt-1 text-sm text-text-secondary">
            {enabled
              ? "Choose which CC tools this task can use. Changes apply to future runs."
              : "Inherit the assigned specialist’s CC tools when the run starts."}
          </p>
        </div>
        <Switch
          aria-label="Change available tools"
          checked={enabled}
          disabled={!props.specialist || !props.catalog}
          onChange={(checked) => {
            if (checked) save(rules);
            else
              props.onChange({
                ...props.value,
                appMcpServers: undefined,
                appToolPermissions: undefined,
              });
          }}
        />
      </div>
      <p className="text-sm text-text-secondary">
        Specialist “Ask” permissions are automatically allowed in autonomous tasks. Chat-only tools
        are unavailable.
      </p>
      {enabled ? (
        <CcToolGroups
          groups={groups}
          capabilities={{ appToolPermissions: rules }}
          taskMode
          onGroupChange={() => {}}
          onToolChange={(group, tool, allowed) => {
            const pattern = `${group}_${tool}`;
            save([
              ...rules.filter((rule) => rule.pattern !== pattern),
              { pattern, action: allowed ? "allow" : "deny" },
            ]);
          }}
        />
      ) : null}
    </section>
  );
}
