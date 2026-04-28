import { lazy, Suspense, useEffect, useRef } from "react";

import { useGlobalTerminalController } from "@/hooks/use-global-terminal-controller";

const GlobalTerminalSurface = lazy(() =>
  import("@/components/terminal/GlobalTerminalSurface").then((module) => ({
    default: module.GlobalTerminalSurface,
  })),
);

export function WorkspaceTerminalPane(props: { defaultCwd?: string }) {
  const { controller, loadError, didHydrate, initialSessionCount } = useGlobalTerminalController({
    defaultCwd: props.defaultCwd,
  });
  const { create, isLoading } = controller;
  const didAutoCreateRef = useRef(false);

  useEffect(() => {
    if (!didHydrate || isLoading || initialSessionCount > 0 || didAutoCreateRef.current) {
      return;
    }

    didAutoCreateRef.current = true;
    void create();
  }, [create, didHydrate, initialSessionCount, isLoading]);

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-text-secondary">
          Loading terminal...
        </div>
      }
    >
      <GlobalTerminalSurface controller={controller} loadError={loadError} mode="pane" />
    </Suspense>
  );
}
