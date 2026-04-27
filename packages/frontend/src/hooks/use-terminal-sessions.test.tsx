import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TerminalSession } from "@cc/shared/schemas";

vi.mock("@/lib/api", () => ({
  createTerminalSession: vi.fn(),
  closeTerminalSession: vi.fn(),
  resizeTerminalSession: vi.fn(),
}));

import { closeTerminalSession, createTerminalSession, resizeTerminalSession } from "@/lib/api";

import { useTerminalSessions } from "./use-terminal-sessions";

describe("useTerminalSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a session and makes it active", async () => {
    vi.mocked(createTerminalSession).mockResolvedValue({
      id: "term-1",
      backend: "opencode",
      cwd: "/workspace",
      createdAt: 1,
    });

    const { result } = renderHook(() => useTerminalSessions());

    await act(async () => {
      await result.current.create();
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.activeId).toBe("term-1");
  });

  it("removes a closed active session and selects a neighbor", async () => {
    vi.mocked(closeTerminalSession).mockResolvedValue(undefined);

    const initialSessions: TerminalSession[] = [
      { id: "term-1", backend: "opencode", cwd: "/a", createdAt: 1 },
      { id: "term-2", backend: "opencode", cwd: "/b", createdAt: 2 },
    ];
    const { result } = renderHook(() => useTerminalSessions(initialSessions, "term-2"));

    await act(async () => {
      await result.current.close("term-2");
    });

    expect(result.current.sessions.map((session) => session.id)).toEqual(["term-1"]);
    expect(result.current.activeId).toBe("term-1");
  });

  it("hydrates incoming sessions after mount", async () => {
    const { result, rerender } = renderHook(
      ({ sessions }: { sessions: TerminalSession[] }) => useTerminalSessions(sessions),
      { initialProps: { sessions: [] as TerminalSession[] } },
    );

    act(() => {
      rerender({
        sessions: [{ id: "term-9", backend: "opencode", cwd: "/tmp", createdAt: 9 }],
      });
    });

    await vi.waitFor(() => {
      expect(result.current.activeId).toBe("term-9");
    });
  });

  it("forwards resize requests", async () => {
    vi.mocked(resizeTerminalSession).mockResolvedValue(undefined);

    const { result } = renderHook(() => useTerminalSessions());

    await act(async () => {
      await result.current.resize("term-1", 120, 30);
    });

    expect(resizeTerminalSession).toHaveBeenCalledWith("term-1", { cols: 120, rows: 30 });
  });
});
