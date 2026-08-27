import { createHash } from "node:crypto";

import type { Logger } from "pino";

import type { OpenCodeService } from "./opencode-service.js";

type WatchdogEvent = {
  type: "session.error";
  properties: {
    sessionID: string;
    error: {
      name: "ChatNoProgressError";
      message: string;
      data: { noProgressMs: number };
    };
  };
};

type WatchdogHandle = {
  conversationId: string;
  directory: string;
  sessionID: string;
  signature: string;
  sawProgress: boolean;
  lastProgressAt: number;
  timer?: ReturnType<typeof setInterval>;
  polling?: boolean;
};

export type InteractiveChatWatchdogService = ReturnType<
  typeof createInteractiveChatWatchdogService
>;

export function createInteractiveChatWatchdogService(options: {
  opencodeService: OpenCodeService;
  logger: Logger;
  noProgressMs?: number;
  pollMs?: number;
  now?: () => number;
}) {
  const noProgressMs = options.noProgressMs ?? 30 * 60 * 1_000;
  const pollMs = options.pollMs ?? 30_000;
  const now = options.now ?? Date.now;
  const handles = new Map<string, WatchdogHandle>();
  const errors = new Map<string, WatchdogEvent>();
  const listeners = new Map<string, Set<(event: WatchdogEvent) => void>>();

  return {
    async prepare(input: {
      conversationId: string;
      directory: string;
      sessionID: string;
    }): Promise<{ arm: () => void; cancel: () => void }> {
      stop(input.conversationId);
      errors.delete(input.conversationId);
      const snapshot = await readSnapshot(input.directory, input.sessionID);
      const handle: WatchdogHandle = {
        ...input,
        signature: snapshot.signature,
        sawProgress: false,
        lastProgressAt: now(),
      };
      handles.set(input.conversationId, handle);

      return {
        arm: () => {
          if (handles.get(input.conversationId) !== handle || handle.timer) return;
          handle.timer = setInterval(() => {
            if (handle.polling) return;
            handle.polling = true;
            void poll(handle).finally(() => {
              handle.polling = false;
            });
          }, pollMs);
          handle.timer.unref?.();
        },
        cancel: () => {
          if (handles.get(input.conversationId) === handle) stop(input.conversationId);
        },
      };
    },

    subscribe(input: {
      conversationId: string;
      signal: AbortSignal;
      onEvent: (event: WatchdogEvent) => void;
    }): void {
      const conversationListeners = listeners.get(input.conversationId) ?? new Set();
      conversationListeners.add(input.onEvent);
      listeners.set(input.conversationId, conversationListeners);
      input.signal.addEventListener(
        "abort",
        () => {
          conversationListeners.delete(input.onEvent);
          if (conversationListeners.size === 0) listeners.delete(input.conversationId);
        },
        { once: true },
      );
    },

    getError(conversationId: string): WatchdogEvent | undefined {
      return errors.get(conversationId);
    },

    cancel(conversationId: string): void {
      stop(conversationId);
      errors.delete(conversationId);
    },

    dispose(): void {
      for (const conversationId of handles.keys()) stop(conversationId);
      listeners.clear();
      errors.clear();
    },
  };

  async function poll(handle: WatchdogHandle): Promise<void> {
    const isCurrent = () => handles.get(handle.conversationId) === handle;
    if (!isCurrent()) return;

    try {
      const [statuses, snapshot] = await Promise.all([
        options.opencodeService.listSessionStatuses(handle.directory),
        readSnapshot(handle.directory, handle.sessionID),
      ]);
      if (!isCurrent()) return;
      if (snapshot.signature !== handle.signature) {
        handle.signature = snapshot.signature;
        handle.sawProgress = true;
        handle.lastProgressAt = now();
      }
      const status = statuses[handle.sessionID];
      if (
        status?.type !== "busy" &&
        status?.type !== "retry" &&
        handle.sawProgress &&
        snapshot.settled
      ) {
        stop(handle.conversationId);
        return;
      }
    } catch (error) {
      if (!isCurrent()) return;
      options.logger.warn(
        { err: error, conversationId: handle.conversationId, sessionID: handle.sessionID },
        "interactive chat watchdog snapshot failed",
      );
    }

    if (now() - handle.lastProgressAt < noProgressMs) return;

    try {
      if (await hasPendingInteraction(handle.directory, handle.sessionID)) {
        if (!isCurrent()) return;
        handle.lastProgressAt = now();
        return;
      }
    } catch (error) {
      if (!isCurrent()) return;
      options.logger.warn(
        { err: error, conversationId: handle.conversationId, sessionID: handle.sessionID },
        "interactive chat watchdog pending-interaction read failed",
      );
    }

    try {
      const finalSnapshot = await readSnapshot(handle.directory, handle.sessionID);
      if (!isCurrent()) return;
      if (finalSnapshot.signature !== handle.signature) {
        handle.signature = finalSnapshot.signature;
        handle.sawProgress = true;
        handle.lastProgressAt = now();
        return;
      }
    } catch {
      if (!isCurrent()) return;
      // A failed final read does not turn an already-stalled session into progress.
    }

    if (!isCurrent()) return;
    try {
      await options.opencodeService.abortSession(
        handle.directory,
        handle.sessionID,
        AbortSignal.timeout(30_000),
      );
    } catch (error) {
      if (!isCurrent()) return;
      options.logger.warn(
        { err: error, conversationId: handle.conversationId, sessionID: handle.sessionID },
        "interactive chat watchdog abort failed",
      );
      return;
    }
    if (!isCurrent()) return;

    const event: WatchdogEvent = {
      type: "session.error",
      properties: {
        sessionID: handle.sessionID,
        error: {
          name: "ChatNoProgressError",
          message:
            "Response stopped automatically because the chat and its delegated sessions produced no observable progress for 30 minutes.",
          data: { noProgressMs },
        },
      },
    };
    errors.set(handle.conversationId, event);
    for (const listener of listeners.get(handle.conversationId) ?? []) listener(event);
    stop(handle.conversationId);
  }

  async function readSnapshot(
    directory: string,
    rootSessionID: string,
  ): Promise<{ signature: string; settled: boolean }> {
    const sessionIDs = await options.opencodeService.getSessionTreeIds(directory, rootSessionID);
    const sessions = [...sessionIDs].sort();
    const hash = createHash("sha256");
    let latestRootMessage:
      | Awaited<ReturnType<OpenCodeService["listSessionMessages"]>>[number]
      | undefined;
    for (const sessionID of sessions) {
      const messages = await options.opencodeService.listSessionMessages(directory, sessionID);
      hash.update(sessionID);
      for (const message of messages) hash.update(JSON.stringify(message));
      if (sessionID === rootSessionID) latestRootMessage = messages.at(-1);
    }
    return {
      signature: hash.digest("hex"),
      settled:
        latestRootMessage?.info.role === "assistant" &&
        typeof latestRootMessage.info.time.completed === "number",
    };
  }

  async function hasPendingInteraction(directory: string, rootSessionID: string): Promise<boolean> {
    const [sessionIDs, permissions, questions] = await Promise.all([
      options.opencodeService.getSessionTreeIds(directory, rootSessionID),
      options.opencodeService.listPendingPermissions(directory),
      options.opencodeService.listPendingQuestions(directory),
    ]);
    return (
      permissions.some((permission) => sessionIDs.has(permission.sessionID)) ||
      questions.some((question) => sessionIDs.has(question.sessionID))
    );
  }

  function stop(conversationId: string): void {
    const handle = handles.get(conversationId);
    if (handle?.timer) clearInterval(handle.timer);
    handles.delete(conversationId);
  }
}
