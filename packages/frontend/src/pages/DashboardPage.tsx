import { ActivityPanel } from "@/components/activities/ActivityPanel";
import { PageHeader } from "@/components/common/PageHeader";

export function DashboardPage() {
  return (
    <div className="grid gap-4">
      <PageHeader
        description="Catch up on what your specialists did while you were away. Swipe a card aside to mark it read."
        eyebrow="Dashboard"
        title="Latest activity"
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActivityPanel />
        </div>
        {/* Right third reserved for future dashboard widgets. */}
        <div className="hidden lg:block" aria-hidden="true" />
      </div>
    </div>
  );
}
