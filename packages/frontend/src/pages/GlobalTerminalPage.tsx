import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { GlobalTerminalSurface } from "@/components/terminal/GlobalTerminalSurface";
import { useGlobalTerminalController } from "@/hooks/use-global-terminal-controller";

export function GlobalTerminalPage() {
  const { controller, loadError } = useGlobalTerminalController();

  return (
    <WorkspaceLayout
      primary={<GlobalTerminalSurface controller={controller} loadError={loadError} />}
    />
  );
}
