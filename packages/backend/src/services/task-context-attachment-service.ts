import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

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

const SAFE_ATTACHMENT_TYPES = {
  ".csv": "text/csv",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webp": "image/webp",
} as const;

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
      const directories = new Set(
        task.context.attachments
          .map((attachment) => attachment.storageKey.split("/")[0])
          .filter((directory): directory is string => Boolean(directory)),
      );

      await Promise.all(
        [...directories].map((directory) =>
          rm(join(options.config.paths.subdirectories.taskContextAttachments, directory), {
            force: true,
            recursive: true,
          }),
        ),
      );
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
  const mimeType = validateMime(filename, input.mimeType);
  const buffer = decodeDataUrl(input.dataUrl, mimeType);

  if (buffer.byteLength !== input.sizeBytes) {
    throw new BadRequestError("Attachment size does not match uploaded content.");
  }

  if (buffer.byteLength > MAX_CONTEXT_ATTACHMENT_SIZE_BYTES) {
    throw new BadRequestError("Attachment exceeds the 10 MB task context limit.");
  }

  const id = createId();
  const ext = extname(filename).toLowerCase();
  const taskDirectoryName = createTaskDirectoryName(task);
  const storageKey = `${taskDirectoryName}/${id}${ext}`;
  const taskDirectory = join(config.paths.subdirectories.taskContextAttachments, taskDirectoryName);
  await mkdir(taskDirectory, { recursive: true });
  await writeFile(join(taskDirectory, `${id}${ext}`), buffer, { mode: 0o600 });

  return {
    id,
    filename,
    mimeType,
    sizeBytes: buffer.byteLength,
    storageKey,
    createdAt: new Date().toISOString(),
  };
}

function createTaskDirectoryName(task: Task): string {
  const titleSlug = task.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return `${titleSlug || "task"}-${task.id}`;
}

function validateFilename(input: string): string {
  const filename = basename(input.trim());

  if (filename.length === 0 || filename !== input.trim() || filename === "." || filename === "..") {
    throw new BadRequestError("Attachment filename is invalid.");
  }

  return filename;
}

function validateMime(filename: string, mimeType: string): string {
  const ext = extname(filename).toLowerCase() as keyof typeof SAFE_ATTACHMENT_TYPES;
  const expectedMime = SAFE_ATTACHMENT_TYPES[ext];

  if (!expectedMime || expectedMime !== mimeType) {
    throw new BadRequestError("Attachment format is not allowed for task context.");
  }

  return expectedMime;
}

function decodeDataUrl(dataUrl: string, mimeType: string): Buffer {
  const prefix = `data:${mimeType};base64,`;

  if (!dataUrl.startsWith(prefix)) {
    throw new BadRequestError("Attachment data URL is invalid.");
  }

  return Buffer.from(dataUrl.slice(prefix.length), "base64");
}

function resolveStoragePath(config: RuntimeConfig, storageKey: string): string {
  const [taskId, filename] = storageKey.split("/");

  if (!taskId || !filename || storageKey.split("/").length !== 2) {
    throw new BadRequestError("Attachment storage key is invalid.");
  }

  return join(config.paths.subdirectories.taskContextAttachments, taskId, filename);
}
