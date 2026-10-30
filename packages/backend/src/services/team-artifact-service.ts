import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { SendConversationAttachmentInput } from "@cc/shared/schemas";
import type { AppDb } from "../db/client.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import { BadRequestError, NotFoundError } from "../lib/api-error.js";
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
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(artifacts.resolveArtifactPath(snapshot.storageKey), destination);
      return {
        artifactId: id,
        title: artifact.title,
        mimeType: snapshot.mimeType,
        checksum: snapshot.checksum,
        path: relative(options.config.paths.workspaceDir, destination),
        ...(snapshot.mimeType.startsWith("text/") && snapshot.sizeBytes <= 256 * 1024
          ? { text: await readFile(destination, "utf8") }
          : {}),
      };
    },
  };
}
