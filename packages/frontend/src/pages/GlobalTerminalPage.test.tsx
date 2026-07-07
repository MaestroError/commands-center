import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TerminalSession } from "@cc/shared/schemas";

import { GlobalTerminalPage } from "./GlobalTerminalPage";

import { listTerminalSessions } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  listTerminalSessions: vi.fn().mockResolvedValue([
    {
      id: "term-1",
      backend: "opencode",
      cwd: "/home/user",
      createdAt: Date.now(),
    },
  ] as TerminalSession[]),
}));

vi.mock("@/hooks/use-terminal-sessions", () => ({
  useTerminalSessions: vi.fn().mockReturnValue({
    sessions: [
      {
        id: "term-1",
        backend: "opencode",
        cwd: "/home/user",
        createdAt: Date.now(),
      },
    ] as TerminalSession[],
    activeId: "term-1",
    activeSession: {
      id: "term-1",
      backend: "opencode",
      cwd: "/home/user",
      createdAt: Date.now(),
    } as TerminalSession,
    create: vi.fn(),
    close: vi.fn(),
    setActive: vi.fn(),
    resize: vi.fn(),
    isLoading: false,
    error: undefined,
  }),
}));

import { useTerminalSessions } from "@/hooks/use-terminal-sessions";

const useTerminalSessionsMock = vi.mocked(useTerminalSessions);

vi.mock("@/components/terminal/TerminalTabsSurface", () => ({
  TerminalTabsSurface: ({ controller: _controller }: { controller: unknown }) => (
    <div data-testid="terminal-tabs-surface">TerminalTabsSurface</div>
  ),
}));

describe("GlobalTerminalPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders TerminalTabsSurface", async () => {
    render(
      <MemoryRouter>
        <GlobalTerminalPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("terminal-tabs-surface")).toBeInTheDocument();
    });

    expect(listTerminalSessions).toHaveBeenCalled();
  });

  it("loads existing sessions on mount", async () => {
    render(
      <MemoryRouter>
        <GlobalTerminalPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(listTerminalSessions).toHaveBeenCalled();
    });
  });

  it("passes controller to TerminalTabsSurface", async () => {
    render(
      <MemoryRouter>
        <GlobalTerminalPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const surface = screen.getByTestId("terminal-tabs-surface");
      expect(surface).toBeInTheDocument();
    });
  });

  it("passes loaded sessions into the terminal controller", async () => {
    render(
      <MemoryRouter>
        <GlobalTerminalPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(useTerminalSessionsMock).toHaveBeenCalledWith([
        {
          id: "term-1",
          backend: "opencode",
          cwd: "/home/user",
          createdAt: expect.any(Number),
        },
      ]);
    });
  });
});
