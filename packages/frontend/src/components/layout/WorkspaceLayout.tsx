import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { useMediaQuery } from "@/hooks/use-media-query";
import { TabBar, type TabItem } from "@/components/common/TabBar";

type Tab = TabItem & {
  content: ReactNode;
};

type WorkspaceLayoutProps = {
  primary: ReactNode;
  contextPane?: {
    title: string;
    tabs: Tab[];
    defaultTabId?: string;
    activeTabId?: string;
    onTabChange?: (tabId: string) => void;
  };
  bottomPane?: {
    title: string;
    tabs: Tab[];
    defaultTabId?: string;
  };
};

const EMPTY_TABS: Tab[] = [];

export function WorkspaceLayout(props: WorkspaceLayoutProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [contextWidth, setContextWidth] = useState(360);
  const [bottomHeight, setBottomHeight] = useState(220);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const [mobileBottomOpen, setMobileBottomOpen] = useState(false);
  const contextTabs = props.contextPane?.tabs ?? EMPTY_TABS;
  const bottomTabs = props.bottomPane?.tabs ?? EMPTY_TABS;
  const [activeContextTab, setActiveContextTab] = useState(
    props.contextPane?.defaultTabId ?? contextTabs[0]?.id,
  );
  const [activeBottomTab, setActiveBottomTab] = useState(
    props.bottomPane?.defaultTabId ?? bottomTabs[0]?.id,
  );

  useEffect(() => {
    if (!props.contextPane?.activeTabId) {
      return;
    }

    setActiveContextTab(props.contextPane.activeTabId);
  }, [props.contextPane?.activeTabId]);

  useEffect(() => {
    if (isDesktop) {
      setMobileBottomOpen(false);
      setMobileContextOpen(false);
    }
  }, [isDesktop]);

  const activeContextContent = useMemo(
    () => contextTabs.find((tab) => tab.id === activeContextTab)?.content,
    [activeContextTab, contextTabs],
  );
  const activeBottomContent = useMemo(
    () => bottomTabs.find((tab) => tab.id === activeBottomTab)?.content,
    [activeBottomTab, bottomTabs],
  );

  return (
    <div className="flex h-[calc(100vh-5.3rem)] flex-col gap-2" data-testid="workspace-layout">
      {!isDesktop && (props.contextPane || props.bottomPane) ? (
        <div className="flex flex-wrap gap-2">
          {props.contextPane ? (
            <button
              className="cc-button cc-button-secondary"
              onClick={() => setMobileContextOpen(true)}
              type="button"
            >
              Open context pane
            </button>
          ) : null}
          {props.bottomPane ? (
            <button
              className="cc-button cc-button-secondary"
              onClick={() => setMobileBottomOpen(true)}
              type="button"
            >
              Open bottom pane
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex min-h-0 flex-1 gap-2">
          <div className="cc-panel min-w-0 flex-1 overflow-hidden">{props.primary}</div>
          {isDesktop && props.contextPane ? (
            <>
              {!contextCollapsed ? (
                <div
                  aria-hidden="true"
                  className="hidden w-[3px] cursor-col-resize rounded-full bg-border/70 transition hover:bg-accent lg:block"
                  onPointerDown={(event) =>
                    startDrag(event, "horizontal", setContextWidth, 280, 560, -1)
                  }
                />
              ) : null}
              <aside
                className={contextCollapsed ? "hidden" : "cc-panel hidden lg:flex lg:flex-col"}
                data-testid="context-pane"
                style={{ width: `${String(contextWidth)}px` }}
              >
                <PaneHeader
                  title={props.contextPane.title}
                  onToggle={() => setContextCollapsed(true)}
                  toggleLabel="Collapse context pane"
                />
                <TabBar
                  activeTabId={activeContextTab}
                  onTabChange={(tabId) => {
                    setActiveContextTab(tabId);
                    props.contextPane?.onTabChange?.(tabId);
                  }}
                  tabs={contextTabs}
                />
                <div className="min-h-0 flex-1 overflow-auto p-4">{activeContextContent}</div>
              </aside>
              {contextCollapsed ? (
                <button
                  aria-label="Restore context pane"
                  className="hidden h-6 w-6 shrink-0 items-center justify-center self-start rounded text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition lg:flex"
                  onClick={() => setContextCollapsed(false)}
                  type="button"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              ) : null}
            </>
          ) : null}
        </div>

        {isDesktop && props.bottomPane ? (
          <>
            {!bottomCollapsed ? (
              <div
                aria-hidden="true"
                className="hidden h-1.5 cursor-row-resize rounded-full bg-border/70 transition hover:bg-accent lg:block"
                onPointerDown={(event) =>
                  startDrag(event, "vertical", setBottomHeight, 160, 360, -1)
                }
              />
            ) : null}
            {!bottomCollapsed ? (
              <section
                className="cc-panel hidden lg:flex lg:flex-col"
                data-testid="bottom-pane"
                style={{ height: `${String(bottomHeight)}px` }}
              >
                <PaneHeader
                  title={props.bottomPane.title}
                  onToggle={() => setBottomCollapsed(true)}
                  toggleLabel="Collapse bottom pane"
                />
                <TabBar
                  activeTabId={activeBottomTab}
                  onTabChange={setActiveBottomTab}
                  tabs={bottomTabs}
                />
                <div className="min-h-0 flex-1 overflow-auto p-4">{activeBottomContent}</div>
              </section>
            ) : (
              <button
                aria-label="Restore bottom pane"
                className="cc-button cc-button-secondary hidden self-start lg:inline-flex"
                onClick={() => setBottomCollapsed(false)}
                type="button"
              >
                Restore bottom pane
              </button>
            )}
          </>
        ) : null}
      </div>

      {!isDesktop && props.contextPane && mobileContextOpen ? (
        <MobilePane title={props.contextPane.title} onClose={() => setMobileContextOpen(false)}>
          <TabBar
            activeTabId={activeContextTab}
            onTabChange={(tabId) => {
              setActiveContextTab(tabId);
              props.contextPane?.onTabChange?.(tabId);
            }}
            tabs={contextTabs}
          />
          <div className="mt-4">{activeContextContent}</div>
        </MobilePane>
      ) : null}

      {!isDesktop && props.bottomPane && mobileBottomOpen ? (
        <MobilePane
          bottom
          title={props.bottomPane.title}
          onClose={() => setMobileBottomOpen(false)}
        >
          <TabBar
            activeTabId={activeBottomTab}
            onTabChange={setActiveBottomTab}
            tabs={bottomTabs}
          />
          <div className="mt-4">{activeBottomContent}</div>
        </MobilePane>
      ) : null}
    </div>
  );
}

function PaneHeader(props: { title: string; onToggle: () => void; toggleLabel: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
      <button
        aria-label={props.toggleLabel}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition"
        onClick={props.onToggle}
        type="button"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <span className="text-sm font-medium text-text-primary">Context</span>
    </div>
  );
}

function MobilePane(props: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  bottom?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-app-bg/85 p-3 backdrop-blur-sm">
      <section
        className={
          props.bottom
            ? "cc-panel absolute inset-x-3 bottom-3 top-24 overflow-auto p-4"
            : "cc-panel absolute inset-3 overflow-auto p-4"
        }
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text-primary">{props.title}</p>
            <p className="text-xs text-text-secondary">Mobile overlay panel</p>
          </div>
          <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
            Close
          </button>
        </div>
        {props.children}
      </section>
    </div>
  );
}

function startDrag(
  event: React.PointerEvent<HTMLDivElement>,
  axis: "horizontal" | "vertical",
  updateValue: Dispatch<SetStateAction<number>>,
  min: number,
  max: number,
  direction: 1 | -1,
) {
  event.preventDefault();
  let lastPos = axis === "horizontal" ? event.clientX : event.clientY;

  const handleMove = (moveEvent: PointerEvent) => {
    const currentPos = axis === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
    const delta = (currentPos - lastPos) * direction;
    lastPos = currentPos;
    updateValue((current) => clamp(current + delta, min, max));
  };

  const handleEnd = () => {
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleEnd);
  };

  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleEnd);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
