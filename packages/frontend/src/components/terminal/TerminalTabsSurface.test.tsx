import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TerminalTabsSurface } from "./TerminalTabsSurface";

import type { TerminalSession } from "@cc/shared/schemas";
import type { UseTerminalSessions } from "@/hooks/use-terminal-sessions";

vi.mock("./TerminalTabBar", () => ({
  TerminalTabBar: (props: {
    activeId?: string;
    onActivate: (id: string) => void;
    onClose: (id: string) => void;
    onNew: () => void;
    sessions: Array<{ id: string; cwd: string }>;
  }) => (
    <div data-testid="terminal-tab-bar">
      <span>{props.activeId}</span>
      <button onClick={props.onNew} type="button">
        New session
      </button>
      {props.sessions.map((session) => (
        <div key={session.id}>
          <button onClick={() => props.onActivate(session.id)} type="button">
            Activate {session.id}
          </button>
          <button onClick={() => props.onClose(session.id)} type="button">
            Close {session.id}
          </button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock("./TerminalInstance", () => ({
  TerminalInstance: (props: {
    session: { id: string };
    onExit: () => void;
    onResize: (cols: number, rows: number) => void;
  }) => (
    <div data-testid="terminal-instance">
      <span>{props.session.id}</span>
      <button onClick={() => props.onResize(120, 40)} type="button">
        Resize terminal
      </button>
      <button onClick={props.onExit} type="button">
        Exit terminal
      </button>
    </div>
  ),
}));

const sessions: TerminalSession[] = [
  { id: "term-1", backend: "opencode", cwd: "/tmp/one", createdAt: 1 },
  { id: "term-2", backend: "opencode", cwd: "/tmp/two", createdAt: 2 },
];

function makeController(overrides: Partial<UseTerminalSessions> = {}): UseTerminalSessions {
  return {
    sessions: overrides.sessions ?? sessions,
    activeId: overrides.activeId ?? "term-1",
    activeSession: overrides.activeSession ?? sessions[0],
    create: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn(),
    setActive: vi.fn(),
    resize: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    error: undefined,
    ...overrides,
  } satisfies UseTerminalSessions;
}

describe("TerminalTabsSurface", () => {
  it("renders the empty state and creates a session from the button and shortcut", () => {
    const controller = makeController({
      sessions: [],
      activeId: undefined,
      activeSession: undefined,
    });

    render(<TerminalTabsSurface controller={controller} />);

    expect(screen.getByText("No terminal sessions")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New Terminal" }));
    fireEvent.keyDown(window, { ctrlKey: true, key: "t" });

    expect(controller.create).toHaveBeenCalledTimes(2);
  });

  it("shows loading and error states when no sessions are available", () => {
    const { rerender } = render(
      <TerminalTabsSurface
        controller={makeController({
          sessions: [],
          activeId: undefined,
          activeSession: undefined,
          isLoading: true,
        })}
      />,
    );

    expect(screen.getByText("Creating terminal session...")).toBeInTheDocument();

    rerender(
      <TerminalTabsSurface
        controller={makeController({
          sessions: [],
          activeId: undefined,
          activeSession: undefined,
          isLoading: false,
          error: "Cannot connect",
        })}
      />,
    );

    expect(screen.getByText("Cannot connect")).toBeInTheDocument();
  });

  it("cycles, closes, and ignores shortcuts from text inputs", () => {
    const controller = makeController();

    render(
      <div>
        <input aria-label="editor" />
        <TerminalTabsSurface controller={controller} />
      </div>,
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: "Tab" });
    expect(controller.setActive).toHaveBeenCalledWith("term-2");

    fireEvent.keyDown(window, { ctrlKey: true, key: "w" });
    expect(controller.close).toHaveBeenCalledWith("term-1");

    const input = screen.getByRole("textbox", { name: "editor" });
    input.focus();
    fireEvent.keyDown(input, { ctrlKey: true, key: "t" });

    expect(controller.create).not.toHaveBeenCalled();
  });

  it("renders the active terminal instance and forwards resize and exit callbacks", () => {
    const controller = makeController();

    render(<TerminalTabsSurface controller={controller} />);

    expect(screen.getByTestId("terminal-instance")).toHaveTextContent("term-1");

    fireEvent.click(screen.getByRole("button", { name: "Resize terminal" }));
    fireEvent.click(screen.getByRole("button", { name: "Exit terminal" }));

    expect(controller.resize).toHaveBeenCalledWith("term-1", 120, 40);
    expect(controller.remove).toHaveBeenCalledWith("term-1");
  });
});
