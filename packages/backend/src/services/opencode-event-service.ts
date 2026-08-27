import type { Logger } from "pino";

import type { RuntimeConfig } from "../lib/runtime-config.js";
import { sanitizeMessageError, sanitizePart } from "../lib/message-mapper.js";

type SseEvent = {
  type: string;
  properties: Record<string, unknown>;
};

type ChatEvent = {
  type: string;
  properties: Record<string, unknown>;
};

export type SubscribeOptions = {
  directory: string;
  sessionID: string;
  signal: AbortSignal;
  onEvent: (event: ChatEvent) => void;
  onTitleUpdate?: (title: string) => void;
};

export type OpenCodeEventService = ReturnType<typeof createOpenCodeEventService>;

export function createOpenCodeEventService(options: {
  config: RuntimeConfig;
  logger: Logger;
  resolveSessionTree?: (
    directory: string,
    rootSessionID: string,
    signal: AbortSignal,
  ) => Promise<Set<string>>;
}) {
  return {
    subscribe(subscribeOptions: SubscribeOptions): void {
      void runSubscription(
        options.config,
        options.logger,
        options.resolveSessionTree ??
          ((_directory, rootSessionID) => Promise.resolve(new Set([rootSessionID]))),
        subscribeOptions,
      );
    },
  };
}

const SESSION_EVENTS = new Set([
  "session.status",
  "message.updated",
  "message.removed",
  "message.part.updated",
  "message.part.delta",
  "message.part.removed",
  "todo.updated",
  "permission.asked",
  "permission.replied",
  "question.asked",
  "question.replied",
  "question.rejected",
  "session.error",
]);
const DESCENDANT_INTERACTION_EVENTS = new Set([
  "permission.asked",
  "permission.replied",
  "question.asked",
  "question.replied",
  "question.rejected",
]);

async function runSubscription(
  config: RuntimeConfig,
  logger: Logger,
  resolveSessionTree: (
    directory: string,
    rootSessionID: string,
    signal: AbortSignal,
  ) => Promise<Set<string>>,
  options: SubscribeOptions,
): Promise<void> {
  const { directory, sessionID, signal, onEvent, onTitleUpdate } = options;
  let retryDelay = 500;
  const maxRetryDelay = 15_000;

  while (!signal.aborted) {
    try {
      await consumeEventStream(
        config,
        directory,
        sessionID,
        signal,
        onEvent,
        resolveSessionTree,
        onTitleUpdate,
      );
      // Stream ended normally (server closed) — reconnect
      retryDelay = 500;
    } catch (error) {
      if (signal.aborted) {
        return;
      }

      logger.warn(
        { err: error, directory, sessionID },
        "opencode event stream error, reconnecting",
      );
    }

    if (signal.aborted) {
      return;
    }

    await delay(retryDelay, signal);
    retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
  }
}

async function consumeEventStream(
  config: RuntimeConfig,
  directory: string,
  sessionID: string,
  signal: AbortSignal,
  onEvent: (event: ChatEvent) => void,
  resolveSessionTree: (
    directory: string,
    rootSessionID: string,
    signal: AbortSignal,
  ) => Promise<Set<string>>,
  onTitleUpdate?: (title: string) => void,
): Promise<void> {
  const url = new URL("/event", config.opencode.baseUrl);
  url.searchParams.set("directory", directory);
  let sessionIDs = await resolveSessionTree(directory, sessionID, ancestrySignal(config, signal));

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`OpenCode SSE returned status ${String(response.status)}`);
  }

  if (!response.body) {
    throw new Error("OpenCode SSE response has no body");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += value;
      const events = extractSseEvents(buffer);
      buffer = events.remainder;

      for (const raw of events.parsed) {
        // Intercept session.updated to propagate title changes
        if (
          onTitleUpdate &&
          raw.type === "session.updated" &&
          typeof raw.properties["sessionID"] === "string" &&
          raw.properties["sessionID"] === sessionID
        ) {
          const info = raw.properties["info"];
          if (
            info &&
            typeof info === "object" &&
            "title" in info &&
            typeof (info as Record<string, unknown>)["title"] === "string"
          ) {
            onTitleUpdate((info as Record<string, unknown>)["title"] as string);
          }
        }

        const eventSessionID = readEventSessionID(raw);
        if (
          eventSessionID &&
          !sessionIDs.has(eventSessionID) &&
          DESCENDANT_INTERACTION_EVENTS.has(raw.type)
        ) {
          sessionIDs = await resolveSessionTree(
            directory,
            sessionID,
            ancestrySignal(config, signal),
          );
        }

        const mapped = mapEvent(sessionID, sessionIDs, raw);

        if (mapped) {
          onEvent(mapped);
        }
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

type ExtractResult = {
  parsed: SseEvent[];
  remainder: string;
};

function extractSseEvents(buffer: string): ExtractResult {
  const parsed: SseEvent[] = [];
  const blocks = buffer.split("\n\n");

  // Last element is either empty (if buffer ended with \n\n) or an incomplete block
  const remainder = blocks.pop() ?? "";

  for (const block of blocks) {
    const dataLines: string[] = [];

    for (const line of block.split("\n")) {
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length === 0) {
      continue;
    }

    const json = dataLines.join("\n");

    try {
      const event = JSON.parse(json) as unknown;

      if (isRecord(event) && typeof event["type"] === "string" && isRecord(event["properties"])) {
        parsed.push(event as SseEvent);
      }
    } catch {
      // Skip malformed events
    }
  }

  return { parsed, remainder };
}

function mapEvent(
  rootSessionID: string,
  sessionIDs: ReadonlySet<string>,
  raw: SseEvent,
): ChatEvent | null {
  // Server-level events
  if (raw.type === "server.connected") {
    return { type: "connected", properties: {} };
  }

  if (raw.type === "server.heartbeat") {
    return { type: "heartbeat", properties: {} };
  }

  // Session-scoped events — filter by sessionID
  if (!SESSION_EVENTS.has(raw.type)) {
    return null;
  }

  const props = raw.properties;
  const eventSessionID = readEventSessionID(raw);

  if (
    !eventSessionID ||
    !sessionIDs.has(eventSessionID) ||
    (eventSessionID !== rootSessionID && !DESCENDANT_INTERACTION_EVENTS.has(raw.type))
  ) {
    return null;
  }
  const sessionID = eventSessionID;

  // Map specific event types
  switch (raw.type) {
    case "message.updated": {
      const info = props["info"] as Record<string, unknown> | undefined;

      if (!info || typeof info["id"] !== "string") {
        return null;
      }

      const time = info["time"] as Record<string, unknown> | undefined;
      const createdMs = typeof time?.["created"] === "number" ? time["created"] : Date.now();
      const completedMs = typeof time?.["completed"] === "number" ? time["completed"] : createdMs;

      return {
        type: raw.type,
        properties: {
          sessionID,
          message: {
            id: info["id"],
            conversationId: "",
            role: info["role"] === "assistant" ? "assistant" : "user",
            content: "",
            parts: [],
            attachments: [],
            parentId: typeof info["parentID"] === "string" ? info["parentID"] : undefined,
            error: sanitizeMessageError(info["error"]),
            createdAt: new Date(createdMs).toISOString(),
            updatedAt: new Date(completedMs).toISOString(),
          },
        },
      };
    }

    case "message.part.updated": {
      const part = props["part"] as Record<string, unknown> | undefined;

      if (!part || typeof part["id"] !== "string" || typeof part["type"] !== "string") {
        return { type: raw.type, properties: props };
      }

      const messageID =
        typeof part["messageID"] === "string"
          ? part["messageID"]
          : typeof props["messageID"] === "string"
            ? props["messageID"]
            : "";

      return {
        type: raw.type,
        properties: {
          sessionID,
          messageID,
          part: sanitizePart(part as { id: string; type: string; [key: string]: unknown }),
        },
      };
    }

    case "message.part.delta": {
      return {
        type: raw.type,
        properties: {
          sessionID,
          messageID: typeof props["messageID"] === "string" ? props["messageID"] : "",
          partID: typeof props["partID"] === "string" ? props["partID"] : "",
          field: typeof props["field"] === "string" ? props["field"] : "text",
          delta: typeof props["delta"] === "string" ? props["delta"] : "",
        },
      };
    }

    case "message.removed": {
      return {
        type: raw.type,
        properties: {
          sessionID,
          messageID: typeof props["messageID"] === "string" ? props["messageID"] : "",
        },
      };
    }

    case "message.part.removed": {
      return {
        type: raw.type,
        properties: {
          sessionID,
          messageID: typeof props["messageID"] === "string" ? props["messageID"] : "",
          partID: typeof props["partID"] === "string" ? props["partID"] : "",
        },
      };
    }

    case "session.status": {
      const status = props["status"];
      const mappedStatus = sanitizeSessionStatus(status);

      return {
        type: raw.type,
        properties: {
          sessionID,
          status: mappedStatus,
        },
      };
    }

    case "session.error": {
      const error = sanitizeMessageError(props["error"]);

      if (!error) {
        return null;
      }

      return {
        type: raw.type,
        properties: {
          sessionID,
          error,
        },
      };
    }

    case "permission.asked": {
      const tool = sanitizeToolLink(props["tool"]);

      return {
        type: raw.type,
        properties: {
          id: typeof props["id"] === "string" ? props["id"] : "",
          sessionID,
          permission: typeof props["permission"] === "string" ? props["permission"] : "",
          patterns: Array.isArray(props["patterns"]) ? props["patterns"] : [],
          metadata: isRecord(props["metadata"]) ? props["metadata"] : {},
          always: Array.isArray(props["always"]) ? props["always"] : [],
          ...(tool ? { tool } : {}),
        },
      };
    }

    case "question.asked": {
      const tool = sanitizeToolLink(props["tool"]);

      return {
        type: raw.type,
        properties: {
          id: typeof props["id"] === "string" ? props["id"] : "",
          sessionID,
          questions: Array.isArray(props["questions"]) ? props["questions"] : [],
          ...(tool ? { tool } : {}),
        },
      };
    }

    case "todo.updated": {
      return {
        type: raw.type,
        properties: {
          sessionID,
          todos: Array.isArray(props["todos"]) ? props["todos"] : [],
        },
      };
    }

    default:
      return { type: raw.type, properties: props };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readEventSessionID(raw: SseEvent): string | undefined {
  return typeof raw.properties["sessionID"] === "string" ? raw.properties["sessionID"] : undefined;
}

function sanitizeToolLink(value: unknown): Record<string, unknown> | undefined {
  // Require non-empty ids: the client parses these events with schemas whose
  // tool link is `z.string().min(1)`, so forwarding an empty id would fail that
  // parse and drop the whole event. Omitting the link instead keeps the event
  // valid — the tool just isn't linkable for the cancel-dot.
  if (
    !isRecord(value) ||
    typeof value["messageID"] !== "string" ||
    value["messageID"].length === 0 ||
    typeof value["callID"] !== "string" ||
    value["callID"].length === 0
  ) {
    return undefined;
  }

  return value;
}

function sanitizeSessionStatus(status: unknown) {
  if (!isRecord(status)) {
    return { type: "idle" as const };
  }

  if (status["type"] === "busy") {
    return { type: "busy" as const };
  }

  if (
    status["type"] === "retry" &&
    typeof status["attempt"] === "number" &&
    typeof status["message"] === "string" &&
    typeof status["next"] === "number"
  ) {
    return {
      type: "retry" as const,
      attempt: status["attempt"],
      message: status["message"],
      next: status["next"],
    };
  }

  return { type: "idle" as const };
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function ancestrySignal(config: RuntimeConfig, subscriptionSignal: AbortSignal): AbortSignal {
  return AbortSignal.any([
    subscriptionSignal,
    AbortSignal.timeout(config.timeouts?.opencodeRequestMs ?? 30_000),
  ]);
}
