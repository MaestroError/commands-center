import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceTerminalPane } from "./WorkspaceTerminalPane";

type GlobalTerminalControllerResult = {
  controller: {
    create: () => Promise<void>;
    isLoading: boolean;
  };
  loadError?: string;
  didHydrate: boolean;
  initialSessionCount: number;
};

const useGlobalTerminalController =
  vi.fn<(input: { defaultCwd?: string }) => GlobalTerminalControllerResult>();

vi.mock("@/hooks/use-global-terminal-controller", () => ({
  useGlobalTerminalController: (input: { defaultCwd?: string }): GlobalTerminalControllerResult =>
    useGlobalTerminalController(input),
}));

vi.mock("@/components/terminal/GlobalTerminalSurface", () => ({
  GlobalTerminalSurface: (props: { loadError?: string; mode: string }) => (
    <div data-testid="global-terminal-surface">
      {props.mode}:{props.loadError ?? "ok"}
    </div>
  ),
}));

describe("WorkspaceTerminalPane", () => {
  beforeEach(() => {
    useGlobalTerminalController.mockReset();
  });

  it("shows the suspense fallback and then renders the global terminal surface", async () => {
    useGlobalTerminalController.mockReturnValue({
      controller: { create: vi.fn(), isLoading: false },
      loadError: "offline",
      didHydrate: true,
      initialSessionCount: 1,
    });

    render(<WorkspaceTerminalPane defaultCwd="/workspace" />);

    expect(screen.getByText("Loading terminal...")).toBeInTheDocument();

    await act(async () => {
      await vi.dynamicImportSettled();
    });

    expect(await screen.findByTestId("global-terminal-surface")).toHaveTextContent("pane:offline");
  });

  it("auto-creates a terminal after hydration when none exist", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    useGlobalTerminalController.mockReturnValue({
      controller: { create, isLoading: false },
      loadError: undefined,
      didHydrate: true,
      initialSessionCount: 0,
    });

    render(<WorkspaceTerminalPane defaultCwd="/workspace" />);

    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
  });

  it("does not auto-create while loading or when sessions already exist", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<WorkspaceTerminalPane defaultCwd="/workspace" />, {
      wrapper: ({ children }: { children: React.ReactNode }) => {
        useGlobalTerminalController.mockReturnValue({
          controller: { create, isLoading: true },
          loadError: undefined,
          didHydrate: true,
          initialSessionCount: 0,
        });
        return children;
      },
    });

    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(create).not.toHaveBeenCalled();

    useGlobalTerminalController.mockReturnValue({
      controller: { create, isLoading: false },
      loadError: undefined,
      didHydrate: true,
      initialSessionCount: 2,
    });

    rerender(<WorkspaceTerminalPane defaultCwd="/workspace" />);

    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(create).not.toHaveBeenCalled();
  });
});
