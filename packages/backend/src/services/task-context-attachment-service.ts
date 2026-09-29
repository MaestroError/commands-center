import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

import {
  isTextualPayload,
  TASK_CONTEXT_ATTACHMENT_EXTENSIONS_LABEL,
  type TaskContextAttachmentExtension,
} from "@cc/shared/lib";
import {
  taskContextSchema,
  uploadTaskContextAttachmentInputSchema,
  type SendConversationAttachmentInput,
  type Task,
  type TaskContext,
  type TaskContextAttachment,
  type UploadTaskContextAttachmentInput,
  type UploadTaskContextAttachmentResponse,
} from "@cc/shared/schemas";

import { createId } from "../db/ids.js";
import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { TaskService } from "./task-service.js";

const MAX_CONTEXT_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_FILENAME_LENGTH = 255;

type AttachmentFormat = { mimeType: string; verify: (bytes: Buffer) => boolean };

/**
 * Every format that may be written to the workspace through the task context
 * API/MCP surface, keyed by extension. The extension decides the format — a
 * caller-supplied mime is never trusted, because browsers and external MCP
 * clients mislabel routinely (`.md` arrives as `text/plain`, `""`, or
 * `text/x-markdown`) and an attacker would simply lie about it.
 *
 * `verify` re-checks the decoded bytes against the format so the extension
 * cannot be used as a disguise: no ELF or archive lands on disk as `logo.png`,
 * and text formats must really decode as UTF-8. Typed by the shared extension
 * list so the advertised formats and the enforced ones cannot drift apart.
 */
const ATTACHMENT_FORMATS: Record<TaskContextAttachmentExtension, AttachmentFormat> = {
  ".csv": { mimeType: "text/csv", verify: isTextualPayload },
  ".gif": {
    mimeType: "image/gif",
    verify: (bytes) => hasAsciiAt(bytes, 0, "GIF87a") || hasAsciiAt(bytes, 0, "GIF89a"),
  },
  ".jpeg": { mimeType: "image/jpeg", verify: (bytes) => hasBytesAt(bytes, 0, [0xff, 0xd8, 0xff]) },
  ".jpg": { mimeType: "image/jpeg", verify: (bytes) => hasBytesAt(bytes, 0, [0xff, 0xd8, 0xff]) },
  ".json": { mimeType: "application/json", verify: isTextualPayload },
  ".log": { mimeType: "text/plain", verify: isTextualPayload },
  ".markdown": { mimeType: "text/markdown", verify: isTextualPayload },
  ".md": { mimeType: "text/markdown", verify: isTextualPayload },
  ".mdx": { mimeType: "text/markdown", verify: isTextualPayload },
  ".pdf": { mimeType: "application/pdf", verify: (bytes) => hasAsciiAt(bytes, 0, "%PDF-") },
  ".png": {
    mimeType: "image/png",
    verify: (bytes) => hasBytesAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  ".rst": { mimeType: "text/plain", verify: isTextualPayload },
  ".tsv": { mimeType: "text/tab-separated-values", verify: isTextualPayload },
  ".txt": { mimeType: "text/plain", verify: isTextualPayload },
  ".webp": {
    mimeType: "image/webp",
    verify: (bytes) => hasAsciiAt(bytes, 0, "RIFF") && hasAsciiAt(bytes, 8, "WEBP"),
  },
  ".xml": { mimeType: "application/xml", verify: isTextualPayload },
  ".yaml": { mimeType: "application/yaml", verify: isTextualPayload },
  ".yml": { mimeType: "application/yaml", verify: isTextualPayload },
};

export type TaskContextAttachmentService = ReturnType<typeof createTaskContextAttachmentService>;

export function createTaskContextAttachmentService(options: {
  config: RuntimeConfig;
  taskService: TaskService;
}) {
  return {
    async storeForTask(
      taskId: string,
      input: UploadTaskContextAttachmentInput,
    ): Promise<TaskContextAttachment> {
      const task = await options.taskService.get(taskId);

      if (!task || task.templateId === task.id) {
        throw new NotFoundError("Task not found.");
      }

      return storeAttachment(
        options.config,
        task,
        uploadTaskContextAttachmentInputSchema.parse(input),
      );
    },

    async upload(
      taskId: string,
      input: UploadTaskContextAttachmentInput,
    ): Promise<UploadTaskContextAttachmentResponse> {
      const parsed = uploadTaskContextAttachmentInputSchema.parse(input);
      const task = await options.taskService.get(taskId);

      if (!task || task.templateId === task.id) {
        throw new NotFoundError("Task not found.");
      }

      const attachment = await storeAttachment(options.config, task, parsed);
      const context = taskContextSchema.parse({
        ...task.context,
        attachments: [...task.context.attachments, attachment],
      });
      const updated = await options.taskService.updateContext(task.id, context);

      if (!updated) {
        throw new NotFoundError("Task not found.");
      }

      return { attachment, context: updated.context };
    },

    async removeForTask(task: Task): Promise<void> {
      await rm(resolveTaskAttachmentDirectory(options.config, task.agentId, task.id), {
        force: true,
        recursive: true,
      });
    },

    async readConversationAttachments(
      context: TaskContext,
    ): Promise<SendConversationAttachmentInput[]> {
      return Promise.all(
        context.attachments.map(async (attachment) => {
          const path = resolveStoragePath(options.config, attachment.storageKey);
          const content = await readFile(path);
          return {
            id: attachment.id,
            type: attachment.mimeType.startsWith("image/")
              ? "image"
              : attachment.mimeType === "application/pdf" || attachment.mimeType.startsWith("text/")
                ? "document"
                : "file",
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            dataUrl: `data:${attachment.mimeType};base64,${content.toString("base64")}`,
          };
        }),
      );
    },
  };
}

async function storeAttachment(
  config: RuntimeConfig,
  task: Task,
  input: UploadTaskContextAttachmentInput,
): Promise<TaskContextAttachment> {
  const filename = validateFilename(input.filename);
  const format = resolveFormat(filename);
  const buffer = decodeDataUrl(input.dataUrl);

  if (buffer.byteLength === 0) {
    throw new BadRequestError("Attachment is empty.");
  }

  // `sizeBytes` is advisory: the decoded payload is what gets written, so it is
  // what the cap applies to. External callers routinely send a character count
  // or a stale size, and rejecting those bought nothing.
  if (buffer.byteLength > MAX_CONTEXT_ATTACHMENT_SIZE_BYTES) {
    throw new BadRequestError("Attachment exceeds the 10 MB task context limit.");
  }

  if (!format.verify(buffer)) {
    throw new BadRequestError(
      `Attachment content does not match its "${extname(filename).toLowerCase()}" extension.`,
    );
  }

  const id = createId();
  const ext = extname(filename).toLowerCase();
  const storageKey = `specialists/${task.agentId}/tasks/${task.id}/context-attachments/${id}${ext}`;
  const taskDirectory = resolveTaskAttachmentDirectory(config, task.agentId, task.id);
  await mkdir(taskDirectory, { recursive: true });
  await writeFile(join(taskDirectory, `${id}${ext}`), buffer, { mode: 0o600 });

  return {
    id,
    filename,
    mimeType: format.mimeType,
    sizeBytes: buffer.byteLength,
    storageKey,
    createdAt: new Date().toISOString(),
  };
}

function validateFilename(input: string): string {
  const trimmed = input.trim();
  const filename = trimmed;

  if (
    filename.length === 0 ||
    /[\\/]/.test(filename) ||
    filename === "." ||
    filename === ".." ||
    filename.length > MAX_ATTACHMENT_FILENAME_LENGTH ||
    // Control characters (NUL included) never belong in a filename and are a
    // classic way to smuggle a second extension past a display surface.
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f\u007f]/.test(filename)
  ) {
    throw new BadRequestError("Attachment filename is invalid.");
  }

  return filename;
}

function resolveFormat(filename: string): AttachmentFormat {
  const format =
    ATTACHMENT_FORMATS[extname(filename).toLowerCase() as TaskContextAttachmentExtension];

  if (!format) {
    throw new BadRequestError(
      `Attachment format is not allowed for task context. Allowed extensions: ${TASK_CONTEXT_ATTACHMENT_EXTENSIONS_LABEL}.`,
    );
  }

  return format;
}

/**
 * Accepts any base64 data URL regardless of the media type the caller declared
 * — the extension already decided the format, and the payload is verified
 * against it — but the base64 itself must be well formed, since `Buffer.from`
 * silently discards anything it cannot parse.
 */
function decodeDataUrl(dataUrl: string): Buffer {
  const match = /^data:[^,]*;base64,(.*)$/s.exec(dataUrl);
  // Some clients wrap base64 at 76 columns; the padding rules still apply.
  const payload = match?.[1]?.replace(/\s+/g, "");

  if (
    payload === undefined ||
    payload.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)
  ) {
    throw new BadRequestError("Attachment data URL is invalid.");
  }

  return Buffer.from(payload, "base64");
}

function hasBytesAt(bytes: Buffer, offset: number, expected: readonly number[]): boolean {
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

function hasAsciiAt(bytes: Buffer, offset: number, expected: string): boolean {
  return bytes.subarray(offset, offset + expected.length).toString("latin1") === expected;
}

function resolveTaskAttachmentDirectory(
  config: RuntimeConfig,
  agentId: string,
  taskId: string,
): string {
  const directory = resolve(
    config.paths.subdirectories.sessions,
    "specialists",
    agentId,
    "tasks",
    taskId,
    "context-attachments",
  );
  ensureDescendant(directory, config.paths.subdirectories.sessions);
  return directory;
}

function resolveStoragePath(config: RuntimeConfig, storageKey: string): string {
  const parts = storageKey.split("/");

  if (
    parts.length !== 6 ||
    parts[0] !== "specialists" ||
    parts[2] !== "tasks" ||
    parts[4] !== "context-attachments" ||
    parts.some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new BadRequestError("Attachment storage key is invalid.");
  }

  const path = resolve(config.paths.subdirectories.sessions, ...parts);
  ensureDescendant(path, config.paths.subdirectories.sessions);
  return path;
}

function ensureDescendant(candidatePath: string, rootPath: string): void {
  const rel = relative(rootPath, candidatePath);

  if (rel === "" || rel.startsWith("..") || rel.startsWith(sep)) {
    throw new BadRequestError("Attachment storage key is invalid.");
  }
}
