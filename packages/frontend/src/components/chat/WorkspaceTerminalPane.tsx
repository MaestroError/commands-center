import { lazy, Suspense } from "react";

import { useGlobalTerminalController } from "@/hooks/use-global-terminal-controller";

const GlobalTerminalSurface = lazy(() =>
  import("@/components/terminal/GlobalTerminalSurface").then((module) => ({
    default: module.GlobalTerminalSurface,
  })),
);

export function WorkspaceTerminalPane() {
  const { controller, loadError } = useGlobalTerminalController();

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
