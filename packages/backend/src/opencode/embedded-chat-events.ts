import { setTimeout as delay } from "node:timers/promises";

import type { Logger } from "pino";

import { mapRemoteMessage, sanitizePart } from "../lib/message-mapper.js";
import type { ConversationEngine } from "../services/conversation-engine.js";
import type { OpenCodeEventService, SubscribeOptions } from "../services/opencode-event-service.js";
import type { EmbeddedOpenCodeHost } from "./embedded-host.js";
import { mapEmbeddedPermission, mapEmbeddedQuestion } from "./embedded-interactions.js";
import { embeddedPartId, mapEmbeddedMessage } from "./embedded-message-mapper.js";

const INTERACTIONS = new Set([
  "permission.asked",
  "permission.replied",
  "form.created",
  "form.replied",
  "form.cancelled",
]);

export function createEmbeddedChatEvents(options: {
  host: EmbeddedOpenCodeHost;
  chat: ConversationEngine;
  logger: Logger;
}): OpenCodeEventService {
  const { host, chat, logger } = options;

  async function consume(subscription: SubscribeOptions): Promise<void> {
    const { sessionID, directory, signal, onEvent } = subscription;
    await chat.getSession(directory, sessionID);
    let sessionIDs = new Set([sessionID]);
    for await (const event of host.events.subscribe({ signal })) {
      if (signal.aborted) return;
      if (event.type === "server.connected") {
        sessionIDs = await chat.getSessionTreeIds(directory, sessionID, signal);
        subscription.onReady?.();
        continue;
      }
      const eventSessionID =
        event.type === "form.created"
          ? event.data.form.sessionID
          : "sessionID" in event.data && typeof event.data.sessionID === "string"
            ? event.data.sessionID
            : undefined;
      if (!eventSessionID) continue;
      if (!sessionIDs.has(eventSessionID) && INTERACTIONS.has(event.type)) {
        sessionIDs = await chat.getSessionTreeIds(directory, sessionID, signal);
      }
      if (
        !sessionIDs.has(eventSessionID) ||
        (eventSessionID !== sessionID && !INTERACTIONS.has(event.type))
      )
        continue;

      const emit = (type: string, properties: Record<string, unknown>): void => {
        if (!signal.aborted)
          onEvent({ type, properties: { sessionID: eventSessionID, ...properties } });
      };
      async function emitMessage(messageID: string, toolsOnly = false): Promise<void> {
        const message = await host.sessions.message.get(
          { sessionID: eventSessionID ?? sessionID, messageID },
          { signal },
        );
        const mapped = mapEmbeddedMessage(eventSessionID ?? sessionID, message);
        if (!mapped) return;
        if (!toolsOnly) {
          const converted = mapRemoteMessage("embedded", mapped);
          emit("message.updated", { message: { ...converted, conversationId: "" } });
        }
        for (const part of mapped.parts) {
          if (!toolsOnly || part.type === "tool")
            emit("message.part.updated", { messageID, part: sanitizePart(part) });
        }
      }

      switch (event.type) {
        case "session.renamed":
          subscription.onTitleUpdate?.(event.data.title);
          break;
        case "session.status":
          emit("session.status", { status: event.data.status });
          break;
        case "session.execution.failed":
          emit("session.error", {
            error: { name: event.data.error.type, message: event.data.error.message },
          });
          break;
        case "session.inbox.delivered":
          await emitMessage(event.data.inboxID);
          break;
        case "session.step.started":
          emit("message.updated", {
            message: {
              id: event.data.assistantMessageID,
              conversationId: "",
              role: "assistant",
              content: "",
              parts: [],
              attachments: [],
              createdAt: new Date(event.data.started).toISOString(),
              updatedAt: new Date(event.data.started).toISOString(),
            },
          });
          break;
        case "session.text.started":
        case "session.reasoning.started":
          emit("message.part.updated", {
            messageID: event.data.assistantMessageID,
            part: {
              id: embeddedPartId(
                event.data.assistantMessageID,
                event.type === "session.text.started" ? "text" : "reasoning",
                event.data.ordinal,
              ),
              type: event.type === "session.text.started" ? "text" : "reasoning",
              text: "",
            },
          });
          break;
        case "session.text.delta":
        case "session.reasoning.delta":
          emit("message.part.delta", {
            messageID: event.data.assistantMessageID,
            partID: embeddedPartId(
              event.data.assistantMessageID,
              event.type === "session.text.delta" ? "text" : "reasoning",
              event.data.ordinal,
            ),
            field: "text",
            delta: event.data.delta,
          });
          break;
        case "session.text.ended":
        case "session.reasoning.ended":
          emit("message.part.updated", {
            messageID: event.data.assistantMessageID,
            part: {
              id: embeddedPartId(
                event.data.assistantMessageID,
                event.type === "session.text.ended" ? "text" : "reasoning",
                event.data.ordinal,
              ),
              type: event.type === "session.text.ended" ? "text" : "reasoning",
              text: event.data.text,
            },
          });
          break;
        case "session.tool.input.started":
        case "session.tool.called":
        case "session.tool.success":
        case "session.tool.failed":
        case "session.tool.progress":
          await emitMessage(event.data.assistantMessageID, true);
          break;
        case "session.step.ended":
        case "session.step.failed":
          await emitMessage(event.data.assistantMessageID);
          break;
        case "permission.asked":
          emit("permission.asked", mapEmbeddedPermission(event.data));
          break;
        case "permission.replied":
          emit("permission.replied", { requestID: event.data.requestID, reply: event.data.reply });
          break;
        case "form.created": {
          const question = mapEmbeddedQuestion(event.data.form);
          if (question) emit("question.asked", question);
          break;
        }
        case "form.replied":
          emit("question.replied", {
            requestID: event.data.id,
            answers: Object.values(event.data.answer).map((answer) =>
              Array.isArray(answer) ? answer : [String(answer)],
            ),
          });
          break;
        case "form.cancelled":
          emit("question.rejected", { requestID: event.data.id });
          break;
      }
    }
  }

  async function run(subscription: SubscribeOptions): Promise<void> {
    let retryMs = 500;
    while (!subscription.signal.aborted) {
      try {
        await consume(subscription);
        retryMs = 500;
      } catch (error) {
        if (subscription.signal.aborted) return;
        logger.warn(
          { err: error, sessionID: subscription.sessionID },
          "embedded chat stream interrupted; reconnecting",
        );
      }
      if (subscription.signal.aborted) return;
      try {
        await delay(retryMs, undefined, { signal: subscription.signal });
      } catch {
        return;
      }
      retryMs = Math.min(retryMs * 2, 15000);
    }
  }

  return {
    subscribe(subscription): void {
      void run(subscription);
    },
  };
}
