import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { ChevronDown, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

import { useMediaQuery } from "@/hooks/use-media-query";
import { TabBar, type TabItem } from "@/components/common/TabBar";
import { Button } from "@/components/ui/button";

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
    // Optional compact section pinned below the tab content, at the bottom of
    // the pane (e.g. a conversation Results/artifacts strip).
    footer?: ReactNode;
  };
  bottomPane?: {
    title: string;
    tabs: Tab[];
    defaultTabId?: string;
    defaultHeight?: number;
    minHeight?: number;
    maxHeight?: number;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    compactHeader?: boolean;
  };
};

const EMPTY_TABS: Tab[] = [];

export function WorkspaceLayout(props: WorkspaceLayoutProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(!(props.bottomPane?.open ?? true));
  const [contextWidth, setContextWidth] = useState(360);
  const [bottomHeight, setBottomHeight] = useState(props.bottomPane?.defaultHeight ?? 220);
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

  useEffect(() => {
    if (props.bottomPane?.open === undefined) {
      return;
    }

    setBottomCollapsed(!props.bottomPane.open);
  }, [props.bottomPane?.open]);

  useEffect(() => {
    if (props.bottomPane?.defaultHeight === undefined) {
      return;
    }

    setBottomHeight(props.bottomPane.defaultHeight);
  }, [props.bottomPane?.defaultHeight]);

  useEffect(() => {
    if (!props.bottomPane) {
      return;
    }

    setActiveBottomTab(props.bottomPane.defaultTabId ?? bottomTabs[0]?.id);
  }, [bottomTabs, props.bottomPane, props.bottomPane?.defaultTabId]);

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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="secondary"
            aria-label="Reload page"
            onClick={() => window.location.reload()}
            type="button"
          >
            <RotateCcw size={14} />
          </Button>
          {props.contextPane ? (
            <Button
              variant="secondary"
              aria-label="Open context pane"
              onClick={() => setMobileContextOpen(true)}
              type="button"
            >
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {props.bottomPane ? (
            <Button
              variant="secondary"
              aria-label="Open bottom pane"
              onClick={() => {
                setMobileBottomOpen(true);
                props.bottomPane?.onOpenChange?.(true);
              }}
              type="button"
            >
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
            </Button>
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
                <div className="min-h-0 flex-1 overflow-auto p-2">{activeContextContent}</div>
                {props.contextPane.footer ? (
                  <div className="shrink-0 border-t border-border">{props.contextPane.footer}</div>
                ) : null}
              </aside>
              {contextCollapsed ? (
                <button
                  aria-label="Restore context pane"
                  className="hidden h-6 w-6 shrink-0 items-center justify-center self-start rounded text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition lg:flex"
                  onClick={() => setContextCollapsed(false)}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
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
                className="hidden h-[3px] cursor-row-resize rounded-full bg-border/70 transition hover:bg-accent lg:block"
                onPointerDown={(event) =>
                  startDrag(
                    event,
                    "vertical",
                    setBottomHeight,
                    props.bottomPane?.minHeight ?? 160,
                    props.bottomPane?.maxHeight ?? 360,
                    -1,
                  )
                }
              />
            ) : null}
            {!bottomCollapsed ? (
              <section
                className="cc-panel hidden lg:flex lg:flex-col"
                data-testid="bottom-pane"
                style={{ height: `${String(bottomHeight)}px` }}
              >
                {props.bottomPane.compactHeader ? (
                  <div className="flex items-center border-b border-border">
                    <button
                      aria-label="Collapse bottom pane"
                      className="ml-3 flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
                      onClick={() => {
                        setBottomCollapsed(true);
                        props.bottomPane?.onOpenChange?.(false);
                      }}
                      type="button"
                    >
                      <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <TabBar
                        activeTabId={activeBottomTab}
                        onTabChange={setActiveBottomTab}
                        tabs={bottomTabs}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <PaneHeader
                      title={props.bottomPane.title}
                      onToggle={() => {
                        setBottomCollapsed(true);
                        props.bottomPane?.onOpenChange?.(false);
                      }}
                      toggleLabel="Collapse bottom pane"
                    />
                    <TabBar
                      activeTabId={activeBottomTab}
                      onTabChange={setActiveBottomTab}
                      tabs={bottomTabs}
                    />
                  </>
                )}
                <div className="min-h-0 flex-1 overflow-auto p-0">{activeBottomContent}</div>
              </section>
            ) : (
              <Button
                variant="secondary"
                aria-label="Restore bottom pane"
                className="hidden self-start lg:inline-flex"
                onClick={() => {
                  setBottomCollapsed(false);
                  props.bottomPane?.onOpenChange?.(true);
                }}
                type="button"
              >
                Restore bottom pane
              </Button>
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
          {props.contextPane.footer ? (
            <div className="mt-4 border-t border-border pt-3">{props.contextPane.footer}</div>
          ) : null}
        </MobilePane>
      ) : null}

      {!isDesktop && props.bottomPane && mobileBottomOpen ? (
        <MobilePane
          bottom
          title={props.bottomPane.title}
          onClose={() => {
            setMobileBottomOpen(false);
            props.bottomPane?.onOpenChange?.(false);
          }}
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
        <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      <span className="text-sm font-medium text-text-primary">{props.title}</span>
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
    <div className="fixed inset-0 z-50 bg-app-bg/85 p-3 backdrop-blur-sm" onClick={props.onClose}>
      <section
        className={
          props.bottom
            ? "cc-panel absolute inset-x-3 bottom-3 top-24 overflow-auto p-4"
            : "cc-panel absolute inset-3 overflow-auto p-4"
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text-primary">{props.title}</p>
            <p className="text-xs text-text-secondary">Mobile overlay panel</p>
          </div>
          <Button variant="secondary" onClick={props.onClose} type="button">
            Close
          </Button>
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
