import { useState } from "react";

import { TabBar } from "@/components/common/TabBar";

import { ActivityThread } from "./ActivityThread";
import { ResolvedActivityList } from "./ResolvedActivityList";

const TABS = [
  { id: "unreads", label: "Unreads" },
  { id: "resolved", label: "Resolved" },
];

export function ActivityPanel() {
  const [activeTab, setActiveTab] = useState("unreads");

  return (
    <section className="cc-panel p-4 sm:p-6">
      <TabBar
        activeTabId={activeTab}
        onTabChange={setActiveTab}
        tabs={TABS}
        testIdPrefix="activity-tab"
      />
      <div className="mt-4">
        {activeTab === "unreads" ? <ActivityThread /> : <ResolvedActivityList />}
      </div>
    </section>
  );
}
