import { createId } from "../db/ids.js";
import { NotFoundError } from "../lib/api-error.js";

import type { ChatEvent, LiveRequest, LiveRequestResolveInput } from "@cc/shared/schemas";

type LiveRequestRecord = {
  request: LiveRequest;
  resolve: (input: LiveRequestResolveInput) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type SubscribeOptions = {
  conversationId: string;
  signal: AbortSignal;
  onEvent: (event: ChatEvent) => void;
};

type CreateLiveRequestInput = Omit<LiveRequest, "id" | "createdAt" | "metadata" | "actions"> & {
  actions?: LiveRequest["actions"];
  metadata?: Record<string, unknown>;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export type LiveRequestService = ReturnType<typeof createLiveRequestService>;

export function createLiveRequestService() {
  const requests = new Map<string, LiveRequestRecord>();
  const subscribers = new Map<string, Set<(event: ChatEvent) => void>>();

  return {
    create(input: CreateLiveRequestInput): Promise<LiveRequestResolveInput> {
      const request: LiveRequest = {
        ...input,
        actions: input.actions ?? [],
        metadata: input.metadata ?? {},
        id: createId(),
        createdAt: new Date().toISOString(),
      };

      const promise = new Promise<LiveRequestResolveInput>((resolve, reject) => {
        const timeout = setTimeout(() => {
          requests.delete(request.id);
          publish(request.conversationId, {
            type: "cc.live_request.cancelled",
            properties: { requestId: request.id, reason: "Request timed out." },
          });
          reject(new Error("Live request timed out."));
        }, input.timeoutMs ?? DEFAULT_TIMEOUT_MS);

        requests.set(request.id, { request, resolve, reject, timeout });
      });

      publish(request.conversationId, {
        type: "cc.live_request.opened",
        properties: { request },
      });

      return promise;
    },

    resolve(conversationId: string, requestId: string, input: LiveRequestResolveInput): void {
      const record = getRequest(conversationId, requestId);
      clearTimeout(record.timeout);
      requests.delete(requestId);
      record.resolve(input);
      publish(conversationId, {
        type: "cc.live_request.resolved",
        properties: { requestId },
      });
    },

    cancel(conversationId: string, requestId: string, reason?: string): void {
      const record = getRequest(conversationId, requestId);
      clearTimeout(record.timeout);
      requests.delete(requestId);
      record.reject(new Error(reason || "Live request cancelled."));
      publish(conversationId, {
        type: "cc.live_request.cancelled",
        properties: { requestId, reason },
      });
    },

    get(conversationId: string, requestId: string): LiveRequest | undefined {
      const record = requests.get(requestId);
      if (!record || record.request.conversationId !== conversationId) {
        return undefined;
      }

      return record.request;
    },

    subscribe(options: SubscribeOptions): void {
      const entries =
        subscribers.get(options.conversationId) ?? new Set<(event: ChatEvent) => void>();
      entries.add(options.onEvent);
      subscribers.set(options.conversationId, entries);

      options.signal.addEventListener(
        "abort",
        () => {
          entries.delete(options.onEvent);
          if (entries.size === 0) {
            subscribers.delete(options.conversationId);
          }
        },
        { once: true },
      );
    },

    dispose(): void {
      for (const record of requests.values()) {
        clearTimeout(record.timeout);
        record.reject(new Error("Server shutting down."));
      }
      requests.clear();
      subscribers.clear();
    },
  };

  function getRequest(conversationId: string, requestId: string): LiveRequestRecord {
    const record = requests.get(requestId);

    if (!record || record.request.conversationId !== conversationId) {
      throw new NotFoundError("Live request not found.");
    }

    return record;
  }

  function publish(conversationId: string, event: ChatEvent): void {
    const entries = subscribers.get(conversationId);

    if (!entries) {
      return;
    }

    for (const subscriber of entries) {
      subscriber(event);
    }
  }
}
