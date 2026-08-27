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
  signature?: string;
  sawProgress: boolean;
  lastProgressAt: number;
  timer?: ReturnType<typeof setInterval>;
  polling?: boolean;
  pollController?: AbortController;
  abortController?: AbortController;
  abortPromise?: Promise<void>;
  abortFailures: number;
  replacements: number;
};

const MAX_ABORT_FAILURES = 3;

export type InteractiveChatWatchdogService = ReturnType<
  typeof createInteractiveChatWatchdogService
>;

export function createInteractiveChatWatchdogService(options: {
  opencodeService: OpenCodeService;
  logger: Logger;
  noProgressMs?: number;
  pollMs?: number;
  prepareTimeoutMs?: number;
  pollTimeoutMs?: number;
  now?: () => number;
}) {
  const noProgressMs = options.noProgressMs ?? 30 * 60 * 1_000;
  const pollMs = options.pollMs ?? 30_000;
  const prepareTimeoutMs = options.prepareTimeoutMs ?? 30_000;
  const pollTimeoutMs = options.pollTimeoutMs ?? prepareTimeoutMs;
  const now = options.now ?? Date.now;
  const handles = new Map<string, WatchdogHandle>();
  const errors = new Map<string, WatchdogEvent>();
  const listeners = new Map<string, Set<(event: WatchdogEvent) => void>>();
  const generations = new Map<string, number>();
  let disposed = false;

  return {
    prepare(input: {
      conversationId: string;
      directory: string;
      sessionID: string;
    }): Promise<{ arm: () => void; cancel: () => void }> {
      return prepareHandle(input, false, false);
    },

    prepareFallback(input: {
      conversationId: string;
      directory: string;
      sessionID: string;
    }): Promise<{ arm: () => void; cancel: () => void }> {
      return prepareHandle(input, false, true);
    },

    async rearm(input: {
      conversationId: string;
      directory: string;
      sessionID: string;
      signal?: AbortSignal;
    }): Promise<void> {
      const prepared = await prepareHandle(input, true, false);
      prepared.arm();
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
      generations.set(conversationId, (generations.get(conversationId) ?? 0) + 1);
      void stop(conversationId);
      errors.delete(conversationId);
    },

    dispose(): void {
      disposed = true;
      for (const conversationId of handles.keys()) void stop(conversationId);
      listeners.clear();
      errors.clear();
    },
  };

  async function prepareHandle(
    input: {
      conversationId: string;
      directory: string;
      sessionID: string;
      signal?: AbortSignal;
    },
    sawProgress: boolean,
    fallback: boolean,
  ): Promise<{ arm: () => void; cancel: () => void }> {
    const generation = generations.get(input.conversationId) ?? 0;
    const activeAbort = handles.get(input.conversationId)?.abortPromise;
    if (activeAbort) await activeAbort;
    const protectedHandle = handles.get(input.conversationId);
    if (protectedHandle) protectedHandle.replacements += 1;
    let replacementReleased = false;

    function releaseReplacement(): void {
      if (replacementReleased) return;
      replacementReleased = true;
      if (protectedHandle) protectedHandle.replacements -= 1;
    }

    let signature: string | undefined;
    if (!fallback) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), prepareTimeoutMs);
      const signal = input.signal
        ? AbortSignal.any([input.signal, controller.signal])
        : controller.signal;
      try {
        signature = (await readSnapshot(input.directory, input.sessionID, signal)).signature;
        signal.throwIfAborted();
      } catch (error) {
        releaseReplacement();
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
    const handle: WatchdogHandle = {
      conversationId: input.conversationId,
      directory: input.directory,
      sessionID: input.sessionID,
      signature,
      sawProgress,
      lastProgressAt: now(),
      abortFailures: 0,
      replacements: 0,
    };
    let cancelled = false;

    return {
      arm: () => {
        if (
          disposed ||
          cancelled ||
          generation !== (generations.get(input.conversationId) ?? 0) ||
          handle.timer
        ) {
          return;
        }
        const previous = handles.get(input.conversationId);
        handles.set(input.conversationId, handle);
        deactivate(previous);
        releaseReplacement();
        errors.delete(input.conversationId);
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
        cancelled = true;
        releaseReplacement();
        if (handles.get(input.conversationId) === handle) void stop(input.conversationId);
      },
    };
  }

  async function poll(handle: WatchdogHandle): Promise<void> {
    const isCurrent = () => handles.get(handle.conversationId) === handle;
    if (!isCurrent()) return;

    const pollController = new AbortController();
    handle.pollController = pollController;
    const pollTimeout = setTimeout(() => pollController.abort(), pollTimeoutMs);

    try {
      const [statuses, snapshot] = await Promise.all([
        options.opencodeService.listSessionStatuses(handle.directory, pollController.signal),
        readSnapshot(handle.directory, handle.sessionID, pollController.signal),
      ]);
      if (!isCurrent()) return;
      const status = statuses[handle.sessionID];
      if (handle.signature === undefined) {
        if (status?.type !== "busy" && status?.type !== "retry") {
          void stop(handle.conversationId);
          return;
        }
        handle.signature = snapshot.signature;
        handle.sawProgress = true;
      } else if (snapshot.signature !== handle.signature) {
        handle.signature = snapshot.signature;
        handle.sawProgress = true;
        handle.lastProgressAt = now();
      }
      if (
        status?.type !== "busy" &&
        status?.type !== "retry" &&
        handle.sawProgress &&
        snapshot.settled
      ) {
        void stop(handle.conversationId);
        return;
      }
    } catch (error) {
      if (!isCurrent()) return;
      if (!pollController.signal.aborted) {
        options.logger.warn(
          { err: error, conversationId: handle.conversationId, sessionID: handle.sessionID },
          "interactive chat watchdog snapshot failed",
        );
      }
    } finally {
      clearTimeout(pollTimeout);
      if (handle.pollController === pollController) handle.pollController = undefined;
    }

    if (now() - handle.lastProgressAt < noProgressMs) return;
    if (!isCurrent()) return;

    const reconciliationController = new AbortController();
    handle.pollController = reconciliationController;
    const reconciliationTimeout = setTimeout(() => reconciliationController.abort(), pollTimeoutMs);
    try {
      try {
        const pendingInteraction = await hasPendingInteraction(
          handle.directory,
          handle.sessionID,
          reconciliationController.signal,
        );
        if (!isCurrent()) return;
        if (pendingInteraction) {
          handle.lastProgressAt = now();
          return;
        }
      } catch (error) {
        if (!isCurrent()) return;
        if (!reconciliationController.signal.aborted) {
          options.logger.warn(
            { err: error, conversationId: handle.conversationId, sessionID: handle.sessionID },
            "interactive chat watchdog pending-interaction read failed",
          );
        }
      }

      try {
        const finalSnapshot = await readSnapshot(
          handle.directory,
          handle.sessionID,
          reconciliationController.signal,
        );
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
    } finally {
      clearTimeout(reconciliationTimeout);
      if (handle.pollController === reconciliationController) handle.pollController = undefined;
    }

    if (!isCurrent()) return;
    if (handle.replacements > 0) return;
    const abortController = new AbortController();
    handle.abortController = abortController;
    const abortTimeout = setTimeout(() => abortController.abort(), 30_000);
    const abortRequest = options.opencodeService
      .abortSession(handle.directory, handle.sessionID, abortController.signal)
      .then(
        () => true,
        (error: unknown) => {
          if (isCurrent()) {
            options.logger.warn(
              { err: error, conversationId: handle.conversationId, sessionID: handle.sessionID },
              "interactive chat watchdog abort failed",
            );
          }
          return false;
        },
      )
      .finally(() => {
        clearTimeout(abortTimeout);
        if (handle.abortController === abortController) handle.abortController = undefined;
      });
    handle.abortPromise = abortRequest.then(() => undefined);
    const aborted = await abortRequest;
    if (!aborted) {
      handle.abortFailures += 1;
      if (handle.abortFailures < MAX_ABORT_FAILURES || !isCurrent()) return;
      publishError(
        handle,
        "Response made no progress and could not be stopped automatically after repeated attempts. Abort the chat before sending another message.",
      );
      void stop(handle.conversationId);
      return;
    }
    if (!isCurrent()) return;

    publishError(
      handle,
      "Response stopped automatically because the chat and its delegated sessions produced no observable progress for 30 minutes.",
    );
    void stop(handle.conversationId);
  }

  function publishError(handle: WatchdogHandle, message: string): void {
    const event: WatchdogEvent = {
      type: "session.error",
      properties: {
        sessionID: handle.sessionID,
        error: {
          name: "ChatNoProgressError",
          message,
          data: { noProgressMs },
        },
      },
    };
    errors.set(handle.conversationId, event);
    for (const listener of listeners.get(handle.conversationId) ?? []) {
      try {
        listener(event);
      } catch (error) {
        options.logger.warn(
          { err: error, conversationId: handle.conversationId, sessionID: handle.sessionID },
          "interactive chat watchdog subscriber failed",
        );
      }
    }
  }

  async function readSnapshot(
    directory: string,
    rootSessionID: string,
    signal?: AbortSignal,
  ): Promise<{ signature: string; settled: boolean }> {
    const sessionIDs = await options.opencodeService.getSessionTreeIds(
      directory,
      rootSessionID,
      signal,
    );
    const sessions = [...sessionIDs].sort();
    const hash = createHash("sha256");
    let latestRootMessage:
      | Awaited<ReturnType<OpenCodeService["listSessionMessages"]>>[number]
      | undefined;
    for (const sessionID of sessions) {
      const messages = await options.opencodeService.listSessionMessages(
        directory,
        sessionID,
        signal,
      );
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

  async function hasPendingInteraction(
    directory: string,
    rootSessionID: string,
    signal: AbortSignal,
  ): Promise<boolean> {
    const [sessionIDs, permissions, questions] = await Promise.all([
      options.opencodeService.getSessionTreeIds(directory, rootSessionID, signal),
      options.opencodeService.listPendingPermissions(directory, signal),
      options.opencodeService.listPendingQuestions(directory, signal),
    ]);
    return (
      permissions.some((permission) => sessionIDs.has(permission.sessionID)) ||
      questions.some((question) => sessionIDs.has(question.sessionID))
    );
  }

  function stop(conversationId: string): Promise<void> | undefined {
    const handle = handles.get(conversationId);
    handles.delete(conversationId);
    deactivate(handle);
    return handle?.abortPromise;
  }

  function deactivate(handle: WatchdogHandle | undefined): void {
    if (handle?.timer) clearInterval(handle.timer);
    handle?.pollController?.abort();
    handle?.abortController?.abort();
  }
}
