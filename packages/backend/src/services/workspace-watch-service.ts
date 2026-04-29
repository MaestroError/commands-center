import { watch, type FSWatcher } from "node:fs";

import type { Logger } from "pino";

const WATCH_DEBOUNCE_MS = 1500;

type WorkspaceChangedEvent = { type: "workspace.changed"; properties: { version: number } };

type SubscribeOptions = {
  directory: string;
  signal: AbortSignal;
  onChange: (event: WorkspaceChangedEvent) => void;
};

type WatchEntry = {
  watcher: FSWatcher;
  subscribers: Set<SubscribeOptions["onChange"]>;
  debounceTimer?: ReturnType<typeof setTimeout>;
  version: number;
};

export type WorkspaceWatchService = ReturnType<typeof createWorkspaceWatchService>;

export function createWorkspaceWatchService(options: { logger: Logger }) {
  const entries = new Map<string, WatchEntry>();

  function subscribe(subscribeOptions: SubscribeOptions): void {
    const entry = ensureEntry(subscribeOptions.directory);
    entry.subscribers.add(subscribeOptions.onChange);

    subscribeOptions.signal.addEventListener(
      "abort",
      () => {
        unsubscribe(subscribeOptions.directory, subscribeOptions.onChange);
      },
      { once: true },
    );
  }

  function dispose(): void {
    for (const [directory, entry] of entries) {
      clearTimeout(entry.debounceTimer);
      entry.watcher.close();
      entries.delete(directory);
    }
  }

  function ensureEntry(directory: string): WatchEntry {
    const existing = entries.get(directory);
    if (existing) {
      return existing;
    }

    const entry: WatchEntry = {
      watcher: watch(directory, { recursive: true }, () => {
        scheduleNotify(directory);
      }),
      subscribers: new Set(),
      version: 0,
    };

    entry.watcher.on("error", (error) => {
      options.logger.warn({ directory, err: error }, "workspace watcher error");
      scheduleNotify(directory);
    });

    entries.set(directory, entry);
    return entry;
  }

  function scheduleNotify(directory: string): void {
    const entry = entries.get(directory);
    if (!entry) {
      return;
    }

    clearTimeout(entry.debounceTimer);
    entry.debounceTimer = setTimeout(() => {
      entry.version += 1;
      const event = { type: "workspace.changed" as const, properties: { version: entry.version } };
      for (const subscriber of entry.subscribers) {
        subscriber(event);
      }
    }, WATCH_DEBOUNCE_MS);
  }

  function unsubscribe(directory: string, subscriber: SubscribeOptions["onChange"]): void {
    const entry = entries.get(directory);
    if (!entry) {
      return;
    }

    entry.subscribers.delete(subscriber);
    if (entry.subscribers.size > 0) {
      return;
    }

    clearTimeout(entry.debounceTimer);
    entry.watcher.close();
    entries.delete(directory);
  }

  return {
    subscribe,
    dispose,
  };
}
