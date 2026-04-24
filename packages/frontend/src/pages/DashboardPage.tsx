import { PageHeader } from "@/components/common/PageHeader";

export function DashboardPage() {
  return (
    <div className="grid gap-4">
      <PageHeader
        description="Overview of your workspace, agents, and system health."
        eyebrow="Dashboard"
        title="Dashboard"
      />
    </div>
  );
}
