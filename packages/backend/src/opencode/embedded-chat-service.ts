import { realpath } from "node:fs/promises";

import { resolvePromptAttachmentMimeType } from "@cc/shared/lib";
import type { SendConversationAttachmentInput } from "@cc/shared/schemas";

import { NotFoundError } from "../lib/api-error.js";
import type { ConversationEngine } from "../services/conversation-engine.js";
import {
  OpenCodeRequestError,
  type OpenCodeSession,
  type OpenCodeSessionMessage,
  type OpenCodeService,
  type OpenCodeSessionStatusMap,
} from "../services/opencode-service.js";
import type { EmbeddedOpenCodeHost } from "./embedded-host.js";
import { createEmbeddedInteractions } from "./embedded-interactions.js";
import { listEmbeddedProviders } from "./embedded-provider-catalog.js";
import { mapEmbeddedMessage } from "./embedded-message-mapper.js";

type PromptInput = Parameters<ConversationEngine["promptSession"]>[0];

export function createEmbeddedChatService(
  host: EmbeddedOpenCodeHost,
): ConversationEngine & Pick<OpenCodeService, "listSessionStatuses"> {
  async function getSession(
    directory: string,
    sessionID: string,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession> {
    const session = await host.sessions.get({ sessionID }, { signal });
    const [actual, expected] = await Promise.all([
      realpath(session.location.directory),
      realpath(directory),
    ]);
    if (actual !== expected) throw new NotFoundError("Session not found in specialist workspace.");
    return session;
  }

  async function listSessionMessages(
    directory: string,
    sessionID: string,
    signal?: AbortSignal,
  ): Promise<OpenCodeSessionMessage[]> {
    await getSession(directory, sessionID, signal);
    const messages: OpenCodeSessionMessage[] = [];
    let cursor: string | undefined;
    do {
      const page = await host.message.list(
        cursor ? { sessionID, cursor } : { sessionID, order: "asc" },
        { signal },
      );
      for (const message of page.data) {
        if (message.type === "idle" && message.outcome === "interrupted") {
          const lastUser = messages.findLastIndex((entry) => entry.info.role === "user");
          const assistant = messages
            .slice(lastUser + 1)
            .findLast((entry) => entry.info.role === "assistant");
          assistant?.parts.push({
            id: `${message.id}:interrupted`,
            type: "step-finish",
            reason: "interrupted",
          });
        }
        const mapped = mapEmbeddedMessage(sessionID, message);
        if (mapped) messages.push(mapped);
      }
      cursor = page.cursor.next ?? undefined;
    } while (cursor);
    return messages;
  }

  async function prepare(
    input: Pick<PromptInput, "directory" | "sessionID" | "agent" | "model" | "signal">,
  ): Promise<void> {
    await getSession(input.directory, input.sessionID, input.signal);
    await host.sessions.switchAgent(
      { sessionID: input.sessionID, agent: input.agent },
      { signal: input.signal },
    );
    await host.sessions.switchModel(
      {
        sessionID: input.sessionID,
        model: { providerID: input.model.providerID, id: input.model.modelID },
      },
      { signal: input.signal },
    );
    await host.listTools(input.directory, input.signal);
  }

  async function promptSessionAsync(input: PromptInput): Promise<void> {
    try {
      await prepare(input);
      const entry = { sessionID: input.sessionID, key: "cc-system" };
      if (input.system) {
        await host.sessions.instructions.entry.put(
          { ...entry, value: input.system },
          { signal: input.signal },
        );
      } else {
        await host.sessions.instructions.entry.remove(entry, { signal: input.signal });
      }
      await host.sessions.prompt(
        {
          sessionID: input.sessionID,
          text: input.text,
          files: attachmentFiles(input.attachments),
          delivery: "queue",
        },
        { signal: input.signal },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        [
          "InvalidRequestError",
          "SessionNotFoundError",
          "AgentNotFoundError",
          "LocationNotFoundError",
          "InstructionEntryValueTooLargeError",
          "SessionBusyError",
          "ConflictError",
          "UnauthorizedError",
        ].includes(error.name)
      ) {
        throw new OpenCodeRequestError(
          error.message,
          error.name.endsWith("NotFoundError")
            ? 404
            : error.name === "ConflictError" || error.name === "SessionBusyError"
              ? 409
              : error.name === "UnauthorizedError"
                ? 401
                : 400,
        );
      }
      throw error;
    }
  }

  return {
    ...createEmbeddedInteractions(host),
    async createSession(directory, options = {}) {
      return host.sessions.create({
        location: { directory },
        title: options.title,
        permissions: options.permission?.map((rule) => ({
          action: rule.permission,
          resource: rule.pattern,
          effect: rule.action,
        })),
      });
    },
    getSession,
    listSessionMessages,
    async listSessionStatuses(directory, signal) {
      const expected = await realpath(directory);
      const active = await host.sessions.active({ signal });
      const statuses: OpenCodeSessionStatusMap = {};
      for (const sessionID of Object.keys(active)) {
        const session = await host.sessions.get({ sessionID }, { signal });
        if ((await realpath(session.location.directory)) === expected) {
          statuses[sessionID] = { type: "busy" };
        }
      }
      return statuses;
    },
    async getSessionTreeIds(directory, rootSessionID, signal) {
      await getSession(directory, rootSessionID, signal);
      const ids = new Set([rootSessionID]);
      for (const parentID of ids) {
        let cursor: string | undefined;
        do {
          const page = await host.sessions.list(cursor ? { cursor } : { parentID }, { signal });
          for (const child of page.data) {
            if (ids.size >= 1000) throw new Error("OpenCode session tree exceeds 1000 sessions.");
            ids.add(child.id);
          }
          cursor = page.cursor.next ?? undefined;
        } while (cursor);
      }
      return ids;
    },
    async getSessionStatus(directory, sessionID, signal) {
      await getSession(directory, sessionID, signal);
      const active = await host.sessions.active({ signal });
      if (active[sessionID]) return { type: "busy" };
      const latest = (await host.message.list({ sessionID, order: "desc", limit: 1 }, { signal }))
        .data[0];
      return {
        type: latest?.type === "idle" && latest.outcome === "interrupted" ? "unknown" : "idle",
      };
    },
    listProviders: (directory) => listEmbeddedProviders(host, directory),
    promptSessionAsync,
    async promptSession(input) {
      const before = new Set(
        (await listSessionMessages(input.directory, input.sessionID, input.signal)).map(
          (message) => message.info.id,
        ),
      );
      await promptSessionAsync(input);
      await host.sessions.wait({ sessionID: input.sessionID }, { signal: input.signal });
      const messages = await listSessionMessages(input.directory, input.sessionID, input.signal);
      const message = messages.findLast(
        (item) => item.info.role === "assistant" && !before.has(item.info.id),
      );
      if (!message) throw new Error("OpenCode completed the prompt without an assistant message.");
      return message;
    },
    async commandSession(input) {
      const slash = input.model.indexOf("/");
      await prepare({
        ...input,
        model: { providerID: input.model.slice(0, slash), modelID: input.model.slice(slash + 1) },
      });
      await host.sessions.command(
        {
          sessionID: input.sessionID,
          name: input.command,
          text: input.arguments,
          files: attachmentFiles(input.attachments),
        },
        { signal: input.signal },
      );
      await host.sessions.wait({ sessionID: input.sessionID }, { signal: input.signal });
    },
    async shellSession(input) {
      await prepare(input);
      await host.sessions.shell({ sessionID: input.sessionID, command: input.command });
    },
    async summarizeSession(input) {
      await getSession(input.directory, input.sessionID);
      await host.sessions.switchModel({
        sessionID: input.sessionID,
        model: { providerID: input.providerID, id: input.modelID },
      });
      await host.sessions.compact({ sessionID: input.sessionID });
      await host.sessions.wait({ sessionID: input.sessionID });
    },
    async abortSession(directory, sessionID, signal) {
      await getSession(directory, sessionID, signal);
      await host.sessions.interrupt({ sessionID }, { signal });
    },
    async deleteSession(directory, sessionID, signal) {
      await getSession(directory, sessionID, signal);
      await host.sessions.remove({ sessionID }, { signal });
    },
  };
}

function attachmentFiles(
  attachments: SendConversationAttachmentInput[] = [],
): { uri: string; name?: string }[] {
  return attachments.map((attachment) => ({
    uri: attachment.dataUrl.replace(
      /^data:[^;,]*/,
      `data:${resolvePromptAttachmentMimeType(attachment.filename, attachment.mimeType)}`,
    ),
    name: attachment.filename,
  }));
}
