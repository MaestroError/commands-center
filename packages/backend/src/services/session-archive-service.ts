import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  sessionArchiveMetadataSchema,
  type ConversationMessage,
  type ConversationPart,
  type SessionArchiveKind,
  type SessionArchiveMaterializeResult,
  type SessionArchiveMetadata,
  type SessionArchiveSpecialist,
  type SessionArchiveStatus,
} from "@cc/shared/schemas";
import type { Logger } from "pino";

import { readConfigFile, writeConfigFileAtomic } from "../lib/config-file.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";

const METADATA_FILE = "metadata.json";
const MESSAGES_FILE = "messages.jsonl";
const TRANSCRIPT_FILE = "transcript.md";

const DEFAULT_FLUSH_INTERVAL_MS = 2_000;
const DEFAULT_MAX_QUEUED_PER_SESSION = 10;

type SpecialistInput = SessionArchiveSpecialist;

export type ChatArchiveInput = {
  specialist: SpecialistInput;
  conversationId: string;
  opencodeSessionId?: string | null;
  title?: string | null;
  status?: SessionArchiveStatus;
};

export type TaskRunArchiveInput = {
  specialist: SpecialistInput;
  conversationId: string;
  opencodeSessionId?: string | null;
  taskId: string;
  taskRunId: string;
  title?: string | null;
  status?: SessionArchiveStatus;
  outcome?: string | null;
};

export type SessionArchiveService = ReturnType<typeof createSessionArchiveService>;

export function createSessionArchiveService(options: {
  config: RuntimeConfig;
  logger?: Logger;
  flushIntervalMs?: number;
  maxQueuedPerSession?: number;
}) {
  const logger = options.logger;
  const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const maxQueuedPerSession = options.maxQueuedPerSession ?? DEFAULT_MAX_QUEUED_PER_SESSION;
  const queues = new Map<string, ConversationMessage[]>();
  let flushTimer: NodeJS.Timeout | undefined;

  function resolveChatArchivePath(input: { agentId: string; conversationId: string }): string {
    return specialistPath(options.config, input.agentId, "chats", input.conversationId);
  }

  function resolveTaskRunArchivePath(input: {
    agentId: string;
    taskId: string;
    taskRunId: string;
  }): string {
    return specialistPath(
      options.config,
      input.agentId,
      "tasks",
      input.taskId,
      "runs",
      input.taskRunId,
    );
  }

  async function ensureArchive(
    archivePath: string,
    kind: SessionArchiveKind,
    base: Omit<
      SessionArchiveMetadata,
      | "version"
      | "kind"
      | "messageCount"
      | "lastAppendedAt"
      | "lastMaterializedAt"
      | "lastMaterializedMessageCount"
      | "files"
      | "createdAt"
      | "updatedAt"
    >,
  ): Promise<SessionArchiveMetadata> {
    await mkdir(archivePath, { recursive: true });
    const existing = await readMetadata(archivePath);
    const now = new Date().toISOString();

    const metadata = sessionArchiveMetadataSchema.parse({
      version: 1,
      kind,
      ...base,
      // Status/outcome are sticky once set (e.g. a completed task run): re-ensuring
      // during a later sync or inspection must not revert terminal state.
      status: existing?.status ?? base.status,
      outcome: existing?.outcome ?? base.outcome,
      // Preserve append/materialize progress and creation time across re-ensures.
      messageCount: existing?.messageCount ?? 0,
      lastAppendedAt: existing?.lastAppendedAt ?? null,
      lastMaterializedAt: existing?.lastMaterializedAt ?? null,
      lastMaterializedMessageCount: existing?.lastMaterializedMessageCount ?? 0,
      files: { messages: MESSAGES_FILE, transcript: TRANSCRIPT_FILE },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    await writeMetadata(archivePath, metadata);
    return metadata;
  }

  async function appendMessages(input: {
    archivePath: string;
    messages: ConversationMessage[];
  }): Promise<void> {
    if (input.messages.length === 0) {
      return;
    }

    const metadata = await readMetadata(input.archivePath);

    if (!metadata) {
      logger?.warn(
        { archivePath: input.archivePath },
        "session archive append skipped: missing metadata",
      );
      return;
    }

    const existingIds = await readMessageIds(input.archivePath);
    const newMessages = input.messages.filter((message) => !existingIds.has(message.id));

    if (newMessages.length === 0) {
      return;
    }

    const payload = newMessages.map((message) => JSON.stringify(message)).join("\n") + "\n";
    await appendFile(join(input.archivePath, MESSAGES_FILE), payload, "utf8");

    const now = new Date().toISOString();
    await writeMetadata(input.archivePath, {
      ...metadata,
      messageCount: existingIds.size + newMessages.length,
      lastAppendedAt: now,
      updatedAt: now,
    });
  }

  function enqueueMessages(input: { archivePath: string; messages: ConversationMessage[] }): void {
    if (input.messages.length === 0) {
      return;
    }

    const queued = queues.get(input.archivePath) ?? [];
    queued.push(...input.messages);
    queues.set(input.archivePath, queued);

    if (queued.length >= maxQueuedPerSession) {
      void flushPath(input.archivePath);
      return;
    }

    scheduleFlush();
  }

  function scheduleFlush(): void {
    if (flushTimer) {
      return;
    }

    flushTimer = setTimeout(() => {
      flushTimer = undefined;
      void flush();
    }, flushIntervalMs);
    flushTimer.unref?.();
  }

  async function flushPath(archivePath: string): Promise<void> {
    const queued = queues.get(archivePath);
    queues.delete(archivePath);

    if (!queued || queued.length === 0) {
      return;
    }

    try {
      await appendMessages({ archivePath, messages: queued });
    } catch (error) {
      logger?.warn({ err: error, archivePath }, "session archive flush failed");
    }
  }

  async function flush(): Promise<void> {
    const paths = [...queues.keys()];
    await Promise.all(paths.map((path) => flushPath(path)));
  }

  async function materialize(input: {
    archivePath: string;
    force?: boolean;
  }): Promise<SessionArchiveMetadata | undefined> {
    const metadata = await readMetadata(input.archivePath);

    if (!metadata) {
      return undefined;
    }

    if (!input.force && metadata.messageCount <= metadata.lastMaterializedMessageCount) {
      return metadata;
    }

    const messages = await readMessages(input.archivePath);
    const transcript = renderTranscript(metadata, messages);
    await atomicWrite(join(input.archivePath, TRANSCRIPT_FILE), transcript);

    const now = new Date().toISOString();
    const updated = sessionArchiveMetadataSchema.parse({
      ...metadata,
      lastMaterializedAt: now,
      lastMaterializedMessageCount: messages.length,
      updatedAt: now,
    });
    await writeMetadata(input.archivePath, updated);
    return updated;
  }

  async function materializeDueSessions(input?: {
    limit?: number;
  }): Promise<SessionArchiveMaterializeResult> {
    const limit = input?.limit ?? 25;
    const result: SessionArchiveMaterializeResult = { materialized: 0, skipped: 0, failed: 0 };
    const archivePaths = await listArchivePaths(options.config);

    for (const archivePath of archivePaths) {
      if (result.materialized >= limit) {
        break;
      }

      try {
        const metadata = await readMetadata(archivePath);

        if (!metadata || metadata.messageCount <= metadata.lastMaterializedMessageCount) {
          result.skipped += 1;
          continue;
        }

        await materialize({ archivePath });
        result.materialized += 1;
      } catch (error) {
        result.failed += 1;
        logger?.warn({ err: error, archivePath }, "session archive materialization failed");
      }
    }

    return result;
  }

  async function setStatus(input: {
    archivePath: string;
    status?: SessionArchiveStatus;
    outcome?: string | null;
  }): Promise<void> {
    const metadata = await readMetadata(input.archivePath);

    if (!metadata) {
      return;
    }

    await writeMetadata(input.archivePath, {
      ...metadata,
      status: input.status ?? metadata.status,
      outcome: input.outcome === undefined ? metadata.outcome : input.outcome,
      updatedAt: new Date().toISOString(),
    });
  }

  async function removeArchive(input: { archivePath: string }): Promise<void> {
    queues.delete(input.archivePath);
    await rm(input.archivePath, { recursive: true, force: true });
  }

  return {
    resolveChatArchivePath,
    resolveTaskRunArchivePath,

    async ensureChatArchive(input: ChatArchiveInput): Promise<SessionArchiveMetadata> {
      const archivePath = resolveChatArchivePath({
        agentId: input.specialist.id,
        conversationId: input.conversationId,
      });

      return ensureArchive(archivePath, "chat", {
        specialist: input.specialist,
        conversationId: input.conversationId,
        opencodeSessionId: input.opencodeSessionId ?? null,
        source: "chat",
        taskId: null,
        taskRunId: null,
        title: input.title ?? null,
        status: input.status ?? "active",
        outcome: null,
      });
    },

    async ensureTaskRunArchive(input: TaskRunArchiveInput): Promise<SessionArchiveMetadata> {
      const archivePath = resolveTaskRunArchivePath({
        agentId: input.specialist.id,
        taskId: input.taskId,
        taskRunId: input.taskRunId,
      });

      return ensureArchive(archivePath, "task_run", {
        specialist: input.specialist,
        conversationId: input.conversationId,
        opencodeSessionId: input.opencodeSessionId ?? null,
        source: "task_run",
        taskId: input.taskId,
        taskRunId: input.taskRunId,
        title: input.title ?? null,
        status: input.status ?? "active",
        outcome: input.outcome ?? null,
      });
    },

    appendMessages,
    enqueueMessages,
    materialize,
    materializeDueSessions,
    setStatus,
    removeArchive,
    flush,

    async dispose(): Promise<void> {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
      }

      await flush();
    },
  };
}

function specialistPath(config: RuntimeConfig, agentId: string, ...segments: string[]): string {
  return resolve(config.paths.subdirectories.sessionSpecialists, agentId, ...segments);
}

async function readMetadata(archivePath: string): Promise<SessionArchiveMetadata | undefined> {
  const parsed = await readConfigFile(
    join(archivePath, METADATA_FILE),
    sessionArchiveMetadataSchema,
  );
  return parsed ?? undefined;
}

async function writeMetadata(archivePath: string, metadata: SessionArchiveMetadata): Promise<void> {
  await writeConfigFileAtomic(
    join(archivePath, METADATA_FILE),
    sessionArchiveMetadataSchema.parse(metadata),
  );
}

async function readMessageIds(archivePath: string): Promise<Set<string>> {
  const ids = new Set<string>();

  for (const message of await readMessages(archivePath)) {
    ids.add(message.id);
  }

  return ids;
}

async function readMessages(archivePath: string): Promise<ConversationMessage[]> {
  let raw: string;

  try {
    raw = await readFile(join(archivePath, MESSAGES_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const messages: ConversationMessage[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      continue;
    }

    messages.push(JSON.parse(trimmed) as ConversationMessage);
  }

  return messages;
}

async function listArchivePaths(config: RuntimeConfig): Promise<string[]> {
  const root = config.paths.subdirectories.sessionSpecialists;
  const paths: string[] = [];

  for (const agentId of await safeReadDir(root)) {
    const specialistRoot = join(root, agentId);

    for (const conversationId of await safeReadDir(join(specialistRoot, "chats"))) {
      paths.push(join(specialistRoot, "chats", conversationId));
    }

    for (const taskId of await safeReadDir(join(specialistRoot, "tasks"))) {
      const runsRoot = join(specialistRoot, "tasks", taskId, "runs");

      for (const runId of await safeReadDir(runsRoot)) {
        paths.push(join(runsRoot, runId));
      }
    }
  }

  return paths;
}

async function safeReadDir(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, path);
}

function renderTranscript(
  metadata: SessionArchiveMetadata,
  messages: ConversationMessage[],
): string {
  const lines: string[] = [];
  const title = metadata.title?.trim() || metadata.conversationId;

  lines.push(`# Session: ${title}`);
  lines.push("");
  lines.push(`- Specialist: ${metadata.specialist.name} (\`${metadata.specialist.slug}\`)`);
  lines.push(`- Source: ${metadata.source}`);
  lines.push(`- Conversation ID: \`${metadata.conversationId}\``);

  if (metadata.opencodeSessionId) {
    lines.push(`- OpenCode Session ID: \`${metadata.opencodeSessionId}\``);
  }

  if (metadata.taskId) {
    lines.push(`- Task ID: \`${metadata.taskId}\``);
  }

  if (metadata.taskRunId) {
    lines.push(`- Task Run ID: \`${metadata.taskRunId}\``);
  }

  lines.push(`- Last materialized: ${new Date().toISOString()}`);
  lines.push(`- Materialized messages: ${messages.length} / ${metadata.messageCount}`);
  lines.push("");
  lines.push("## Messages");
  lines.push("");

  for (const message of messages) {
    const tag = message.role === "user" ? "user_message" : "agent_message";
    lines.push(`<${tag} id="${message.id}" timestamp="${message.createdAt}">`);
    lines.push("");
    lines.push(message.content.trim());
    lines.push("");

    const toolCalls = renderToolCalls(message.parts);

    if (toolCalls.length > 0) {
      lines.push("<tool_calls>");
      lines.push(...toolCalls);
      lines.push("</tool_calls>");
      lines.push("");
    }

    lines.push(`</${tag}>`);
    lines.push("");
  }

  return lines.join("\n");
}

function renderToolCalls(parts: ConversationPart[]): string[] {
  return parts
    .filter((part) => part.type === "tool" || part.type === "tool-invocation")
    .map((part) => {
      const name = typeof part["tool"] === "string" ? part["tool"] : "tool";
      const state = (part["state"] ?? {}) as { status?: unknown };
      const status = typeof state.status === "string" ? state.status : "completed";
      return `<tool_call name="${escapeAttribute(name)}" status="${escapeAttribute(status)}" />`;
    });
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
