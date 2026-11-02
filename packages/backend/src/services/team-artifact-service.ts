import { constants } from "node:fs";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { SendConversationAttachmentInput } from "@cc/shared/schemas";
import type { AppDb } from "../db/client.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import { createSecureDirectory } from "../lib/secure-directory.js";
import { createArtifactService } from "./artifact-service.js";

export function createTeamArtifactService(options: { db: AppDb; config: RuntimeConfig }) {
  const artifacts = createArtifactService(options);
  return {
    async attachments(ids: string[]): Promise<SendConversationAttachmentInput[]> {
      const result: SendConversationAttachmentInput[] = [];
      let total = 0;
      for (const id of ids) {
        const artifact = await artifacts.getArtifact(id);
        if (!artifact) throw new NotFoundError("Shared artifact not found.");
        if (artifact.type === "url") continue;
        const snapshot = await artifacts.publishArtifact(id);
        total += snapshot.sizeBytes;
        if (total > 20 * 1024 * 1024)
          throw new BadRequestError("Shared artifacts exceed the 20 MB handoff limit.");
        if (!snapshot.storageKey) throw new NotFoundError("Artifact snapshot is missing.");
        const content = await readFile(artifacts.resolveArtifactPath(snapshot.storageKey));
        result.push({
          type: "file",
          filename: snapshot.originalFilename,
          mimeType: snapshot.mimeType,
          sizeBytes: content.length,
          dataUrl: `data:${snapshot.mimeType};base64,${content.toString("base64")}`,
        });
      }
      return result;
    },
    async read(id: string, receiverSlug: string) {
      const artifact = await artifacts.getArtifact(id);
      if (!artifact) throw new NotFoundError("Shared artifact not found.");
      if (artifact.type === "url")
        return { artifactId: id, title: artifact.title, url: artifact.link };
      const snapshot = await artifacts.publishArtifact(id);
      if (!snapshot.storageKey) throw new NotFoundError("Artifact snapshot is missing.");
      const destination = join(
        options.config.paths.subdirectories.specialists,
        receiverSlug,
        ".team-inputs",
        id,
        snapshot.originalFilename,
      );
      const realDirectory = await createSecureDirectory(
        dirname(destination),
        options.config.paths.subdirectories.specialists,
        "Team artifact destination directory is invalid.",
      );
      const content = await readFile(artifacts.resolveArtifactPath(snapshot.storageKey));
      const file = await open(
        destination,
        constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW,
        0o600,
      );
      try {
        const stat = await file.stat();
        const destinationStat = await lstat(destination);
        if (
          !stat.isFile() ||
          stat.nlink !== 1 ||
          !destinationStat.isFile() ||
          destinationStat.nlink !== 1 ||
          destinationStat.dev !== stat.dev ||
          destinationStat.ino !== stat.ino ||
          (await realpath(destination)) !== join(realDirectory, snapshot.originalFilename)
        )
          throw new BadRequestError("Team artifact destination file is invalid.");
        await file.truncate(0);
        await file.writeFile(content);
      } finally {
        await file.close();
      }
      return {
        artifactId: id,
        title: artifact.title,
        mimeType: snapshot.mimeType,
        checksum: snapshot.checksum,
        path: relative(options.config.paths.workspaceDir, destination),
        ...(snapshot.mimeType.startsWith("text/") && snapshot.sizeBytes <= 256 * 1024
          ? { text: content.toString("utf8") }
          : {}),
      };
    },
  };
}
