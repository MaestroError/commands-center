import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TerminalSession } from "@cc/shared/schemas";

vi.mock("@/lib/api", () => ({
  connectTerminalWebSocket: vi.fn(),
}));

import { connectTerminalWebSocket } from "@/lib/api";

import { TerminalInstance } from "./TerminalInstance";

type MockSocket = {
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

type MockTerminalInstance = {
  focus: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  paste: ReturnType<typeof vi.fn>;
  selection: string;
};

const session: TerminalSession = {
  id: "term-1",
  backend: "opencode",
  cwd: "/workspace",
  createdAt: 1,
};

describe("TerminalInstance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 }));
    getTestHarness().__ccTestXterm.mockTerminalInstances.length = 0;
    getTestHarness().__ccTestXterm.mockWebLinksAddonInstances.length = 0;
    getTestHarness().__ccTestXterm.mockSerializeAddonInstances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("restores a saved buffer snapshot on mount", async () => {
    window.localStorage.setItem("cc.global-terminal.buffer.term-1", "restored output");
    const socket = createSocket();
    vi.mocked(connectTerminalWebSocket).mockReturnValue(socket as never);

    render(<TerminalInstance session={session} onResize={vi.fn()} onExit={vi.fn()} />);

    await waitForTerminalReady();

    socket.onopen?.(new Event("open"));
    vi.runAllTimers();

    const terminal = getLastTerminal();
    expect(terminal.write).toHaveBeenCalledWith("restored output", expect.any(Function));
  });

  it("persists a serialized buffer snapshot on unmount", async () => {
    const socket = createSocket();
    vi.mocked(connectTerminalWebSocket).mockReturnValue(socket as never);

    const view = render(<TerminalInstance session={session} onResize={vi.fn()} onExit={vi.fn()} />);
    await waitForTerminalReady();
    socket.onopen?.(new Event("open"));
    vi.runAllTimers();

    const serializeAddon = getLastSerializeAddon();
    serializeAddon.serialized = "saved output";

    view.unmount();

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "cc.global-terminal.buffer.term-1",
      "saved output",
    );
  });

  it("reconnects after an abnormal close when the session still exists", async () => {
    const firstSocket = createSocket();
    const secondSocket = createSocket();
    vi.mocked(connectTerminalWebSocket)
      .mockReturnValueOnce(firstSocket as never)
      .mockReturnValueOnce(secondSocket as never);

    render(<TerminalInstance session={session} onResize={vi.fn()} onExit={vi.fn()} />);
    await waitForTerminalReady();
    firstSocket.onopen?.(new Event("open"));
    firstSocket.onclose?.(new CloseEvent("close", { code: 1006 }));

    await vi.runAllTimersAsync();

    expect(fetch).toHaveBeenCalledWith("/api/terminal/term-1");
    expect(connectTerminalWebSocket).toHaveBeenCalledTimes(2);
  });

  it("removes the session when the reconnect probe returns 404", async () => {
    const socket = createSocket();
    const onExit = vi.fn();
    vi.mocked(connectTerminalWebSocket).mockReturnValue(socket as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 404 }));

    render(<TerminalInstance session={session} onResize={vi.fn()} onExit={onExit} />);
    await waitForTerminalReady();
    socket.onopen?.(new Event("open"));
    socket.onclose?.(new CloseEvent("close", { code: 1006 }));

    await vi.runAllTimersAsync();

    expect(onExit).toHaveBeenCalled();
    expect(window.localStorage.removeItem).toHaveBeenCalledWith("cc.global-terminal.buffer.term-1");
  });

  it("debounces resize reporting", async () => {
    const socket = createSocket();
    const onResize = vi.fn();
    vi.mocked(connectTerminalWebSocket).mockReturnValue(socket as never);

    render(<TerminalInstance session={session} onResize={onResize} onExit={vi.fn()} />);
    await waitForTerminalReady();
    socket.onopen?.(new Event("open"));

    await vi.advanceTimersByTimeAsync(119);
    expect(onResize).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onResize).toHaveBeenCalledWith(80, 24);
  });

  it("opens links only on modifier click", async () => {
    const socket = createSocket();
    vi.mocked(connectTerminalWebSocket).mockReturnValue(socket as never);

    render(<TerminalInstance session={session} onResize={vi.fn()} onExit={vi.fn()} />);
    await waitForTerminalReady();

    const addon = getLastWebLinksAddon();
    addon.handler?.(new MouseEvent("click"), "https://example.com");
    expect(window.open).not.toHaveBeenCalled();

    addon.handler?.(new MouseEvent("click", { ctrlKey: true }), "https://example.com");
    expect(window.open).toHaveBeenCalledWith(
      "https://example.com",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("copies selected text and pastes clipboard text", async () => {
    const socket = createSocket();
    vi.mocked(connectTerminalWebSocket).mockReturnValue(socket as never);

    const view = render(<TerminalInstance session={session} onResize={vi.fn()} onExit={vi.fn()} />);
    await waitForTerminalReady();
    const terminal = getLastTerminal();
    terminal.selection = "copied-text";

    const shell = view.container.querySelector(".xterm");
    expect(shell).toBeTruthy();

    const copyEvent = new Event("copy", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(copyEvent, "clipboardData", {
      value: { setData: vi.fn() },
      configurable: true,
    });
    shell?.dispatchEvent(copyEvent);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("copied-text");

    expect(terminal.paste).not.toHaveBeenCalled();
  });

  it("focuses the terminal on mount", async () => {
    const socket = createSocket();
    vi.mocked(connectTerminalWebSocket).mockReturnValue(socket as never);

    render(<TerminalInstance session={session} onResize={vi.fn()} onExit={vi.fn()} />);
    await waitForTerminalReady();

    const terminal = getLastTerminal();
    expect(terminal.focus).toHaveBeenCalled();
  });
});

function createSocket(): MockSocket {
  return {
    readyState: WebSocket.OPEN,
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send: vi.fn(),
    close: vi.fn(),
  };
}

function getTestHarness() {
  return globalThis as typeof globalThis & {
    __ccTestXterm: {
      mockTerminalInstances: MockTerminalInstance[];
      mockWebLinksAddonInstances: Array<{ handler?: (event: MouseEvent, uri: string) => void }>;
      mockSerializeAddonInstances: Array<{ serialized: string }>;
    };
  };
}

function getLastTerminal() {
  const harness = getTestHarness();
  return harness.__ccTestXterm.mockTerminalInstances.at(-1)!;
}

function getLastWebLinksAddon() {
  const harness = getTestHarness();
  return harness.__ccTestXterm.mockWebLinksAddonInstances.at(-1)!;
}

function getLastSerializeAddon() {
  const harness = getTestHarness();
  return harness.__ccTestXterm.mockSerializeAddonInstances.at(-1)!;
}

async function waitForTerminalReady() {
  await vi.dynamicImportSettled();
}
