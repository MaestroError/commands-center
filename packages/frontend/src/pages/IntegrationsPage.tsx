import { PageHeader } from "@/components/common/PageHeader";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";

export function IntegrationsPage() {
  return (
    <div className="grid gap-4">
      <PageHeader
        description="Integrations can compose their own primary tabs while still inheriting the same shell, spacing, and panel conventions as the rest of the app."
        eyebrow="Integrations"
        title="Manage Composio apps and MCP servers"
      />
      <WorkspaceLayout
        primary={
          <div className="grid gap-4 p-4">
            <div className="flex flex-wrap gap-2">
              <span className="cc-tab cc-tab-active">Composio Apps</span>
              <span className="cc-tab">MCP Servers</span>
            </div>
            <div className="cc-empty-state min-h-[24rem]">
              Both integration surfaces can evolve here without requiring a new top-level layout.
            </div>
          </div>
        }
      />
    </div>
  );
}
