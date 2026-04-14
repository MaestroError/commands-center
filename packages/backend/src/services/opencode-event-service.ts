import type { Logger } from "pino";

import type { RuntimeConfig } from "../lib/runtime-config.js";
import { sanitizePart } from "../lib/message-mapper.js";

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
};

export type OpenCodeEventService = ReturnType<typeof createOpenCodeEventService>;

export function createOpenCodeEventService(options: { config: RuntimeConfig; logger: Logger }) {
  return {
    subscribe(subscribeOptions: SubscribeOptions): void {
      void runSubscription(options.config, options.logger, subscribeOptions);
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
]);

async function runSubscription(
  config: RuntimeConfig,
  logger: Logger,
  options: SubscribeOptions,
): Promise<void> {
  const { directory, sessionID, signal, onEvent } = options;
  let retryDelay = 500;
  const maxRetryDelay = 15_000;

  while (!signal.aborted) {
    try {
      await consumeEventStream(config, directory, sessionID, signal, onEvent);
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
): Promise<void> {
  const url = new URL("/event", config.opencode.baseUrl);
  url.searchParams.set("directory", directory);

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
        const mapped = mapEvent(sessionID, raw);

        if (mapped) {
          onEvent(mapped);
        }
      }
    }
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

      if (event && typeof event === "object" && "type" in event && typeof event.type === "string") {
        parsed.push(event as SseEvent);
      }
    } catch {
      // Skip malformed events
    }
  }

  return { parsed, remainder };
}

function mapEvent(sessionID: string, raw: SseEvent): ChatEvent | null {
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
  const eventSessionID = typeof props["sessionID"] === "string" ? props["sessionID"] : undefined;

  if (eventSessionID !== sessionID) {
    return null;
  }

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
      let statusType = "idle";

      if (status && typeof status === "object" && "type" in status) {
        statusType = String((status as { type: string }).type);
      }

      return {
        type: raw.type,
        properties: {
          sessionID,
          status: statusType,
        },
      };
    }

    case "permission.asked": {
      return {
        type: raw.type,
        properties: {
          id: typeof props["id"] === "string" ? props["id"] : "",
          sessionID,
          permission: typeof props["permission"] === "string" ? props["permission"] : "",
          patterns: Array.isArray(props["patterns"]) ? props["patterns"] : [],
          metadata: isRecord(props["metadata"]) ? props["metadata"] : {},
          always: Array.isArray(props["always"]) ? props["always"] : [],
        },
      };
    }

    case "question.asked": {
      return {
        type: raw.type,
        properties: {
          id: typeof props["id"] === "string" ? props["id"] : "",
          sessionID,
          questions: Array.isArray(props["questions"]) ? props["questions"] : [],
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
