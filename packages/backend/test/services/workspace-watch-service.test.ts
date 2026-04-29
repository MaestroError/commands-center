import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";

const { watchMock } = vi.hoisted(() => ({ watchMock: vi.fn() }));

vi.mock("node:fs", () => ({
  watch: watchMock,
}));

import { createWorkspaceWatchService } from "../../src/services/workspace-watch-service";

describe("workspace-watch-service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    watchMock.mockReset();
    watchMock.mockImplementation(
      (
        _path: string,
        _options: { recursive: boolean },
        onChange: (eventType: string, filename: string | Buffer | null) => void,
      ) => createWatcherDouble(onChange),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces event storms into a single workspace change event", async () => {
    const watcher = createWatcherDouble();
    watchMock.mockImplementationOnce(
      (
        _path: string,
        _options: { recursive: boolean },
        onChange: (eventType: string, filename: string | Buffer | null) => void,
      ) => createWatcherDouble(onChange, watcher),
    );
    const onChange = vi.fn();
    const service = createWorkspaceWatchService({ logger: createLogger() });

    service.subscribe({
      directory: "/tmp/workspace",
      signal: new AbortController().signal,
      onChange,
    });

    watcher.emit("change", "rename", "file-1");
    watcher.emit("change", "change", "file-2");
    watcher.emit("change", "rename", "file-3");

    await vi.advanceTimersByTimeAsync(1499);
    expect(onChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      type: "workspace.changed",
      properties: { version: 1 },
    });
  });

  it("closes the watcher when the last subscriber unsubscribes", () => {
    const watcher = createWatcherDouble();
    watchMock.mockImplementationOnce(
      (
        _path: string,
        _options: { recursive: boolean },
        onChange: (eventType: string, filename: string | Buffer | null) => void,
      ) => createWatcherDouble(onChange, watcher),
    );
    const service = createWorkspaceWatchService({ logger: createLogger() });
    const abortController = new AbortController();

    service.subscribe({
      directory: "/tmp/workspace",
      signal: abortController.signal,
      onChange: vi.fn(),
    });

    abortController.abort();

    expect(watcher.close).toHaveBeenCalledTimes(1);
  });
});

function createWatcherDouble(
  onChange?: (eventType: string, filename: string | Buffer | null) => void,
  existing?: EventEmitter & { close: ReturnType<typeof vi.fn> },
) {
  const emitter = existing ?? Object.assign(new EventEmitter(), { close: vi.fn() });
  if (onChange) {
    emitter.on("change", onChange);
  }
  return Object.assign(emitter, {
    close: emitter.close,
  });
}

function createLogger() {
  return {
    level: "info",
    silent: vi.fn(),
    msgPrefix: "",
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  } as unknown as Logger;
}
