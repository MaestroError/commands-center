import { useEffect, useRef, type ReactNode } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";

export type TabItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  ariaLabel?: string;
  iconOnly?: boolean;
  panelId?: string;
  triggerId?: string;
};

type TabBarProps = {
  tabs: TabItem[];
  activeTabId?: string;
  onTabChange: (tabId: string) => void;
  /** When set, each tab button receives `data-testid="${testIdPrefix}-${tab.id}"`. */
  testIdPrefix?: string;
};

export function TabBar({ tabs, activeTabId, onTabChange, testIdPrefix }: TabBarProps) {
  const lastRequestedTabId = useRef<string | undefined>(undefined);

  useEffect(() => {
    lastRequestedTabId.current = undefined;
  }, [activeTabId]);

  function requestTabChange(tabId: string) {
    if (lastRequestedTabId.current === tabId) {
      return;
    }

    lastRequestedTabId.current = tabId;
    onTabChange(tabId);
  }

  return (
    <Tabs
      activationMode="automatic"
      orientation="horizontal"
      value={activeTabId ?? ""}
      onValueChange={requestTabChange}
    >
      <TabsList className="overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <TabsTrigger
            aria-controls={tab.panelId}
            aria-label={tab.ariaLabel}
            className={cn(
              tab.iconOnly
                ? "inline-flex h-10 w-10 items-center justify-center px-0"
                : tab.icon
                  ? "inline-flex items-center gap-2"
                  : undefined,
            )}
            data-testid={testIdPrefix ? `${testIdPrefix}-${tab.id}` : undefined}
            id={tab.triggerId}
            key={tab.id}
            onClick={() => requestTabChange(tab.id)}
            value={tab.id}
          >
            {tab.icon ? <span aria-hidden="true">{tab.icon}</span> : null}
            {tab.iconOnly ? <span className="sr-only">{tab.label}</span> : tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
