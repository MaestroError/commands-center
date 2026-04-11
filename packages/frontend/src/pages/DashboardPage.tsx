import { PageHeader } from "@/components/common/PageHeader";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";

export function DashboardPage() {
  return (
    <div className="grid gap-4">
      <PageHeader
        description="The global shell and workspace layout now exist, so dashboard content can plug into a stable surface in the next epic."
        eyebrow="Dashboard"
        title="Operate the workspace from one stable shell"
      />
      <WorkspaceLayout
        contextPane={{
          title: "Context",
          tabs: [
            {
              id: "health",
              label: "Health",
              content: <PlaceholderCard title="System health cards land here." />,
            },
            {
              id: "activity",
              label: "Activity",
              content: <PlaceholderCard title="Recent runs and activity will appear here." />,
            },
          ],
        }}
        primary={
          <PlaceholderSurface title="Dashboard widgets and quick actions are deferred to U1, but this primary pane already exercises the shared workspace layout." />
        }
      />
    </div>
  );
}

function PlaceholderSurface(props: { title: string }) {
  return (
    <div className="flex h-full min-h-[28rem] items-center justify-center p-8 text-center text-sm leading-6 text-text-secondary">
      {props.title}
    </div>
  );
}

function PlaceholderCard(props: { title: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-text-secondary">
      {props.title}
    </div>
  );
}
