import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";

import { resolvePromptAttachmentMimeType } from "@cc/shared/lib";
import type { SendConversationAttachmentInput } from "@cc/shared/schemas";
import type { Logger } from "pino";
import { z } from "zod";

import { createId } from "../db/ids.js";
import { BadRequestError } from "../lib/api-error.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";

const MANIFEST_FILENAME = "manifest.json";
const QUARANTINE_PREFIX = ".chat-upload-";
// A directory is renamed under `.pending` first and only promoted to `.deleting`
// once its inode is confirmed to be the one that was verified. The sweep reclaims
// `.deleting` alone, so uploads that could not be confirmed are never reaped.
const PENDING_SUFFIX = ".pending";
const DELETING_SUFFIX = ".deleting";

const chatUploadMetadataSchema = z
  .object({
    id: z.string().min(1),
    filename: z.string().min(1),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    storageKey: z.string().min(1),
    createdAt: z.string().datetime(),
  })
  .strict();

const chatUploadManifestSchema = z
  .object({
    version: z.literal(1),
    uploads: z.array(chatUploadMetadataSchema),
  })
  .strict();

export type ChatUploadMetadata = z.infer<typeof chatUploadMetadataSchema>;
export type ChatUploadedFile = ChatUploadMetadata & { absolutePath: string };
export type ChatUploadPersistence = {
  uploads: ChatUploadMetadata[];
  rollback(): Promise<void>;
};

export type ChatUploadService = ReturnType<typeof createChatUploadService>;

export function createChatUploadService(options: { config: RuntimeConfig; logger?: Logger }) {
  const mutationTails = new Map<string, Promise<unknown>>();
  // Quarantine directories currently being deleted by this service, so the
  // opportunistic sweep never removes one out from under a live deletion.
  const activeQuarantines = new Set<string>();

  return {
    async persist(input: {
      agentId: string;
      conversationId: string;
      attachments: SendConversationAttachmentInput[];
    }): Promise<ChatUploadPersistence> {
      if (input.attachments.length === 0) {
        return { uploads: [], rollback: () => Promise.resolve() };
      }

      const key = `${input.agentId}/${input.conversationId}`;
      const uploads = await serializeMutation(key, () => persistUploads(input));
      let rolledBack = false;

      return {
        uploads,
        async rollback(): Promise<void> {
          if (rolledBack) return;
          rolledBack = true;
          await serializeMutation(key, () => rollbackUploads(input, uploads));
        },
      };
    },

    async list(input: { agentId: string; conversationId: string }): Promise<ChatUploadedFile[]> {
      const uploadDirectory = resolveUploadDirectory(
        options.config,
        input.agentId,
        input.conversationId,
      );
      const secureDirectory = await ensureSecureUploadDirectory(
        uploadDirectory,
        options.config.paths.subdirectories.sessions,
        false,
      );
      if (!secureDirectory) return [];
      const manifest = await readValidatedManifest(options.config, input, secureDirectory);

      return [...manifest.uploads]
        .sort(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
        )
        .map((upload) => ({
          ...upload,
          absolutePath: resolveStoragePath(options.config, input, upload),
        }));
    },

    async removeForConversation(input: { agentId: string; conversationId: string }): Promise<void> {
      const key = `${input.agentId}/${input.conversationId}`;
      await serializeMutation(key, async () => {
        await sweepStaleQuarantines();
        const uploadDirectory = resolveUploadDirectory(
          options.config,
          input.agentId,
          input.conversationId,
        );
        const secureDirectory = await ensureSecureUploadDirectory(
          uploadDirectory,
          options.config.paths.subdirectories.sessions,
          false,
        );
        if (!secureDirectory) return;
        const directory = await lstat(secureDirectory).catch(() => {
          throw new Error("Chat upload directory could not be inspected.");
        });
        const realRoot = await realpath(options.config.paths.subdirectories.sessions).catch(() => {
          throw new Error("Chat upload directory could not be inspected.");
        });
        const quarantineId = randomUUID();
        const quarantinePath = resolve(
          realRoot,
          `${QUARANTINE_PREFIX}${quarantineId}${PENDING_SUFFIX}`,
        );
        const deletingPath = resolve(
          realRoot,
          `${QUARANTINE_PREFIX}${quarantineId}${DELETING_SUFFIX}`,
        );
        activeQuarantines.add(deletingPath);

        try {
          await rename(secureDirectory, quarantinePath).catch((error: unknown) => {
            options.logger?.warn(
              { err: error, agentId: input.agentId, conversationId: input.conversationId },
              "chat upload directory could not be quarantined",
            );
            throw new Error("Chat uploads could not be removed.");
          });
          const quarantined = await lstat(quarantinePath);
          const realQuarantinePath = await realpath(quarantinePath);

          if (
            !quarantined.isDirectory() ||
            quarantined.isSymbolicLink() ||
            quarantined.dev !== directory.dev ||
            quarantined.ino !== directory.ino ||
            realQuarantinePath !== quarantinePath
          ) {
            // The rename resolved through an ancestor that changed underneath
            // us, so this directory belongs to somebody else. Hand it back when
            // its former location is still canonical; otherwise keep it under
            // `.pending`, which the sweep never touches, rather than restoring
            // it through a path we can no longer trust.
            await restoreQuarantine(quarantinePath, secureDirectory, input);
            throw new Error("Chat upload directory changed during deletion.");
          }

          // Confirmed ours: only now does it carry the name the sweep reclaims.
          await rename(quarantinePath, deletingPath);
          await rm(deletingPath, {
            force: true,
            recursive: true,
          });
        } catch (error) {
          options.logger?.warn(
            { err: error, agentId: input.agentId, conversationId: input.conversationId },
            "chat upload deletion quarantine could not be removed",
          );
          throw error instanceof Error && isSafeMessage(error)
            ? error
            : new Error("Chat uploads could not be removed.");
        } finally {
          activeQuarantines.delete(deletingPath);
        }
      });
    },
  };

  async function restoreQuarantine(
    quarantinePath: string,
    originalPath: string,
    owner: { agentId: string; conversationId: string },
  ): Promise<void> {
    const parent = dirname(originalPath);
    const canonicalParent = await realpath(parent).catch(() => undefined);

    if (canonicalParent !== parent) {
      options.logger?.error(
        { agentId: owner.agentId, conversationId: owner.conversationId },
        "chat upload directory retained: its former location is no longer canonical",
      );
      return;
    }

    await rename(quarantinePath, originalPath).catch((error: unknown) => {
      options.logger?.error(
        { err: error, agentId: owner.agentId, conversationId: owner.conversationId },
        "quarantined chat upload directory could not be restored",
      );
    });
  }

  // An interrupted deletion leaves a quarantined directory at the sessions root.
  // Reclaim them opportunistically so uploaded bytes never outlive their chat.
  async function sweepStaleQuarantines(): Promise<void> {
    const sessionsRoot = options.config.paths.subdirectories.sessions;
    const entries = await readdir(sessionsRoot).catch(() => [] as string[]);

    await Promise.all(
      entries
        .filter((entry) => entry.startsWith(QUARANTINE_PREFIX) && entry.endsWith(DELETING_SUFFIX))
        .map((entry) => resolve(sessionsRoot, entry))
        .filter((path) => !activeQuarantines.has(path))
        .map((path) =>
          rm(path, { force: true, recursive: true }).catch((error: unknown) => {
            options.logger?.warn(
              { err: error },
              "stale chat upload quarantine could not be removed",
            );
          }),
        ),
    );
  }

  async function persistUploads(input: {
    agentId: string;
    conversationId: string;
    attachments: SendConversationAttachmentInput[];
  }): Promise<ChatUploadMetadata[]> {
    const uploadDirectory = resolveUploadDirectory(
      options.config,
      input.agentId,
      input.conversationId,
    );
    const created: ChatUploadMetadata[] = [];
    const writtenPaths: string[] = [];

    try {
      await createSecureUploadDirectory(
        uploadDirectory,
        options.config.paths.subdirectories.sessions,
      );
      const { manifest: current, committed } = await readManifestForWrite(
        options.config,
        input,
        uploadDirectory,
      );
      // Seed the manifest before writing any payload so an interrupted send can
      // never leave a non-empty directory without metadata — that state would
      // otherwise fail every later read and write for the chat.
      if (!committed) await writeManifest(uploadDirectory, current);

      for (const attachment of input.attachments) {
        const id = createId();
        const filename = attachment.filename ?? "attachment";
        const mimeType = resolvePromptAttachmentMimeType(attachment.filename, attachment.mimeType);
        const content = decodeDataUrl(attachment.dataUrl);
        const extension = resolveSafeExtension(filename, mimeType);
        const storedFilename = `${id}.${extension}`;
        const storageKey = [
          "specialists",
          input.agentId,
          "chats",
          input.conversationId,
          "uploads",
          storedFilename,
        ].join("/");
        const absolutePath = resolve(uploadDirectory, storedFilename);
        ensureDescendant(absolutePath, uploadDirectory);
        // Recorded before the write: `wx` creates the file before the bytes land,
        // so a half-written file still has to be cleaned up — an unlisted leftover
        // would otherwise sit in the directory forever.
        writtenPaths.push(absolutePath);
        await writeFile(absolutePath, content, { flag: "wx", mode: 0o600 });
        const upload = {
          id,
          filename,
          mimeType,
          sizeBytes: content.byteLength,
          storageKey,
          createdAt: new Date().toISOString(),
        };
        created.push(upload);
        await chmod(absolutePath, 0o600);
      }

      await writeManifest(uploadDirectory, {
        version: 1,
        uploads: [...current.uploads, ...created],
      });
      return created;
    } catch (error) {
      // Cleanup must never throw over the original failure: a raw filesystem
      // error would both mask it and leak an absolute host path to the operator.
      await Promise.all(
        writtenPaths.map((path) =>
          rm(path, { force: true }).catch((cleanupError: unknown) => {
            options.logger?.warn(
              { err: cleanupError, conversationId: input.conversationId },
              "chat upload cleanup failed",
            );
          }),
        ),
      );

      if (error instanceof BadRequestError) throw error;
      options.logger?.warn(
        { err: error, conversationId: input.conversationId },
        "chat upload persistence failed",
      );
      throw new Error("Uploaded files could not be saved.");
    }
  }

  async function rollbackUploads(
    input: { agentId: string; conversationId: string },
    uploads: ChatUploadMetadata[],
  ): Promise<void> {
    if (uploads.length === 0) return;
    const uploadDirectory = resolveUploadDirectory(
      options.config,
      input.agentId,
      input.conversationId,
    );
    const secureDirectory = await ensureSecureUploadDirectory(
      uploadDirectory,
      options.config.paths.subdirectories.sessions,
      true,
    );
    if (!secureDirectory) throw new Error("Chat upload directory is unavailable.");
    const { manifest } = await readManifestForWrite(options.config, input, secureDirectory);
    const rollbackIds = new Set(uploads.map((upload) => upload.id));
    const retained = manifest.uploads.filter((upload) => !rollbackIds.has(upload.id));

    // The manifest is pruned first and kept even when it empties: dropping it
    // would leave the rejected files behind with no metadata if the process
    // exited here, which fails every later read and write for the chat.
    await writeManifest(secureDirectory, { version: 1, uploads: retained });

    await Promise.all(
      uploads.map((upload) =>
        rm(resolveStoragePath(options.config, input, upload), { force: true }),
      ),
    );
  }

  function serializeMutation<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = mutationTails.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    const tail = current
      .catch(() => undefined)
      .finally(() => {
        if (mutationTails.get(key) === tail) mutationTails.delete(key);
      });
    mutationTails.set(key, tail);
    return current;
  }
}

async function readManifest(uploadDirectory: string, read?: { tolerateMissing?: boolean }) {
  const manifestPath = resolve(uploadDirectory, MANIFEST_FILENAME);
  let manifestFile: Awaited<ReturnType<typeof lstat>>;

  try {
    manifestFile = await lstat(manifestPath);
  } catch (error) {
    if (isFilesystemError(error, "ENOENT")) {
      const entries = await readdir(uploadDirectory).catch((directoryError: unknown) => {
        if (isFilesystemError(directoryError, "ENOENT")) return [];
        throw new Error("Uploaded file metadata could not be read.");
      });
      // Reads refuse to hide files they cannot describe. Writes instead start a
      // fresh manifest, so leftovers from an interrupted persist cannot block
      // every later upload in the chat.
      if (entries.length === 0 || read?.tolerateMissing)
        return { version: 1 as const, uploads: [] };
      throw new Error("Uploaded file metadata is missing.");
    }
    throw new Error("Uploaded file metadata could not be read.");
  }
  if (!manifestFile.isFile() || manifestFile.isSymbolicLink()) {
    throw new Error("Uploaded file metadata is invalid.");
  }

  const content = await readFile(manifestPath, "utf8").catch(() => {
    throw new Error("Uploaded file metadata could not be read.");
  });

  try {
    return chatUploadManifestSchema.parse(JSON.parse(content));
  } catch {
    throw new Error("Uploaded file metadata is invalid.");
  }
}

// The write paths only need a structurally sound manifest. Ownership of every
// storage key is still enforced so a tampered entry can never be carried
// forward, but a file the specialist edited or removed must not block new
// uploads or a rollback — presence and size are validated on read instead.
async function readManifestForWrite(
  config: RuntimeConfig,
  owner: { agentId: string; conversationId: string },
  uploadDirectory: string,
) {
  const manifest = await readManifest(uploadDirectory, { tolerateMissing: true });

  for (const upload of manifest.uploads) {
    resolveStoragePath(config, owner, upload);
  }

  const committed = await lstat(resolve(uploadDirectory, MANIFEST_FILENAME))
    .then(() => true)
    .catch(() => false);

  return { manifest, committed };
}

async function readValidatedManifest(
  config: RuntimeConfig,
  owner: { agentId: string; conversationId: string },
  uploadDirectory: string,
) {
  const manifest = await readManifest(uploadDirectory);

  await Promise.all(
    manifest.uploads.map(async (upload) => {
      const absolutePath = resolveStoragePath(config, owner, upload);
      const file = await lstat(absolutePath).catch(() => undefined);

      if (!file?.isFile() || file.isSymbolicLink() || file.size !== upload.sizeBytes) {
        throw new Error("Uploaded file metadata references an unavailable file.");
      }
    }),
  );

  return manifest;
}

async function writeManifest(
  uploadDirectory: string,
  manifest: z.infer<typeof chatUploadManifestSchema>,
): Promise<void> {
  const parsed = chatUploadManifestSchema.parse(manifest);
  const manifestPath = resolve(uploadDirectory, MANIFEST_FILENAME);
  const tempPath = `${manifestPath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFile(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await chmod(tempPath, 0o600);
    await rename(tempPath, manifestPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function decodeDataUrl(dataUrl: string): Buffer {
  const commaIndex = dataUrl.indexOf(",");

  if (!dataUrl.startsWith("data:") || commaIndex < 5) {
    throw new BadRequestError("Attachment data URL is invalid.");
  }

  const metadata = dataUrl.slice(5, commaIndex);
  const encoded = dataUrl.slice(commaIndex + 1);

  try {
    if (metadata.split(";").includes("base64")) {
      if (!isCanonicalBase64(encoded)) {
        throw new Error("invalid base64");
      }
      return Buffer.from(encoded, "base64");
    }

    return decodePercentEncodedBytes(encoded);
  } catch {
    throw new BadRequestError("Attachment data URL is invalid.");
  }
}

// Percent escapes in a non-base64 data URL are raw octets, not UTF-8 text.
// decodeURIComponent() would reject payloads the chat pipeline accepts today
// (`data:application/octet-stream,%FF`), so decode escape by escape instead.
function decodePercentEncodedBytes(value: string): Buffer {
  const escapePattern = /%[0-9A-Fa-f]{2}/g;
  const segments: Buffer[] = [];
  let index = 0;

  for (let match = escapePattern.exec(value); match; match = escapePattern.exec(value)) {
    segments.push(Buffer.from(value.slice(index, match.index), "utf8"));
    segments.push(Buffer.from(match[0].slice(1), "hex"));
    index = match.index + match[0].length;
  }

  segments.push(Buffer.from(value.slice(index), "utf8"));
  return Buffer.concat(segments);
}

function isCanonicalBase64(value: string): boolean {
  if (value.length === 0) return true;
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return false;
  return Buffer.from(value, "base64").toString("base64") === value;
}

function resolveSafeExtension(filename: string, mimeType: string): string {
  const normalizedFilename = filename.replaceAll("\\", "/");
  const candidate = extname(normalizedFilename).slice(1).toLowerCase();

  if (/^[a-z0-9]{1,16}$/.test(candidate)) return candidate;

  return (
    {
      "application/json": "json",
      "application/pdf": "pdf",
      "image/gif": "gif",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "text/csv": "csv",
      "text/markdown": "md",
      "text/plain": "txt",
    }[mimeType] ?? "bin"
  );
}

function resolveUploadDirectory(
  config: RuntimeConfig,
  agentId: string,
  conversationId: string,
): string {
  assertSafeSegment(agentId);
  assertSafeSegment(conversationId);
  const sessionsRoot = config.paths.subdirectories.sessions;
  const directory = resolve(
    sessionsRoot,
    "specialists",
    agentId,
    "chats",
    conversationId,
    "uploads",
  );
  ensureDescendant(directory, sessionsRoot);
  return directory;
}

function resolveStoragePath(
  config: RuntimeConfig,
  owner: { agentId: string; conversationId: string },
  upload: ChatUploadMetadata,
): string {
  const parts = upload.storageKey.split("/");
  const expectedFilenamePrefix = `${upload.id}.`;

  if (
    parts.length !== 6 ||
    parts[0] !== "specialists" ||
    parts[1] !== owner.agentId ||
    parts[2] !== "chats" ||
    parts[3] !== owner.conversationId ||
    parts[4] !== "uploads" ||
    !parts[5]?.startsWith(expectedFilenamePrefix) ||
    !/^[A-Za-z0-9]+\.[a-z0-9]{1,16}$/.test(parts[5])
  ) {
    throw new Error("Uploaded file metadata contains an invalid storage key.");
  }

  const uploadDirectory = resolveUploadDirectory(config, owner.agentId, owner.conversationId);
  const absolutePath = resolve(config.paths.subdirectories.sessions, ...parts);
  ensureDescendant(absolutePath, uploadDirectory);
  return absolutePath;
}

function assertSafeSegment(value: string): void {
  if (
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\")
  ) {
    throw new BadRequestError("Chat upload owner is invalid.");
  }
}

function ensureDescendant(candidatePath: string, rootPath: string): void {
  const rel = relative(rootPath, candidatePath);

  if (rel === "" || rel.startsWith("..") || rel.startsWith(sep)) {
    throw new BadRequestError("Chat upload path is invalid.");
  }
}

async function ensureSecureUploadDirectory(
  uploadDirectory: string,
  sessionsRoot: string,
  required: boolean,
): Promise<string | false> {
  const directory = await lstat(uploadDirectory).catch((error: unknown) => {
    if (isFilesystemError(error, "ENOENT")) return undefined;
    throw new Error("Chat upload directory could not be inspected.");
  });

  if (!directory) {
    if (required) throw new Error("Chat upload directory is unavailable.");
    return false;
  }
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    throw new Error("Chat upload directory is invalid.");
  }

  const [realRoot, realDirectory] = await Promise.all([
    realpath(sessionsRoot),
    realpath(uploadDirectory),
  ]).catch(() => {
    // Native errors carry the absolute sessions path, and this message is
    // returned verbatim by the MCP tool.
    throw new Error("Chat upload directory could not be inspected.");
  });
  ensureDescendant(realDirectory, realRoot);
  const expectedDirectory = resolve(realRoot, relative(sessionsRoot, uploadDirectory));
  if (realDirectory !== expectedDirectory) {
    throw new Error("Chat upload directory is invalid.");
  }
  return realDirectory;
}

async function createSecureUploadDirectory(
  uploadDirectory: string,
  sessionsRoot: string,
): Promise<void> {
  await mkdir(sessionsRoot, { recursive: true });
  const realRoot = await realpath(sessionsRoot);
  const segments = relative(sessionsRoot, uploadDirectory).split(sep);
  let current = sessionsRoot;
  let expected = realRoot;

  for (const segment of segments) {
    assertSafeSegment(segment);
    current = resolve(current, segment);
    expected = resolve(expected, segment);
    await mkdir(current).catch((error: unknown) => {
      if (!isFilesystemError(error, "EEXIST")) throw error;
    });
    const directory = await lstat(current);
    if (!directory.isDirectory() || directory.isSymbolicLink()) {
      throw new Error("Chat upload directory is invalid.");
    }
    const realCurrent = await realpath(current);
    ensureDescendant(realCurrent, realRoot);
    if (realCurrent !== expected) {
      throw new Error("Chat upload directory is invalid.");
    }
  }
}

// Messages this service raises itself are safe to return to a caller; native
// filesystem errors are not, because they embed absolute host paths.
const SAFE_MESSAGES = new Set([
  "Chat upload directory changed during deletion.",
  "Chat upload directory could not be inspected.",
  "Chat upload directory is invalid.",
  "Chat upload directory is unavailable.",
  "Chat uploads could not be removed.",
]);

function isSafeMessage(error: Error): boolean {
  return SAFE_MESSAGES.has(error.message);
}

function isFilesystemError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
