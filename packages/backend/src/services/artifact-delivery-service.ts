import type { Logger } from "pino";

import type { Artifact, McpArtifactSummary } from "@cc/shared/schemas";

import { buildArtifactSignedUrl, type ArtifactDisposition } from "../lib/artifact-signed-url.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { ArtifactService } from "./artifact-service.js";

export type ArtifactDeliveryOptions = {
  displayEnabled: boolean;
  downloadEnabled: boolean;
  baseUrl: string;
  /** Signed-URL expiry (epoch ms); 0 = no expiry. */
  expiresAtMs: number;
};

export type ArtifactDeliveryService = ReturnType<typeof createArtifactDeliveryService>;

export function createArtifactDeliveryService(deps: {
  artifactService: ArtifactService;
  config: RuntimeConfig;
  logger?: Logger;
}) {
  function sign(
    artifactId: string,
    disposition: ArtifactDisposition,
    options: ArtifactDeliveryOptions,
  ): string {
    return buildArtifactSignedUrl({
      artifactId,
      disposition,
      expMs: options.expiresAtMs,
      secretKey: deps.config.secretKey,
      baseUrl: options.baseUrl,
    });
  }

  return {
    // Build the delivery projection for one artifact. Idempotent: file/document
    // artifacts are snapshotted once and the signed URLs regenerate identically.
    async buildDelivery(
      artifact: Artifact,
      options: ArtifactDeliveryOptions,
    ): Promise<McpArtifactSummary> {
      const base = {
        title: artifact.title,
        description: artifact.description,
        type: artifact.type,
      };

      // `url` artifacts are external links: display is the link, no download.
      if (artifact.type === "url") {
        return {
          ...base,
          displayUrl: options.displayEnabled ? artifact.link : null,
          downloadUrl: null,
        };
      }

      // file / document: publish an immutable snapshot so serving is stable even
      // if the agent later overwrites the workspace file. Degrade to title/type
      // if the artifact can't be published (missing source, etc.).
      let published;
      try {
        published = await deps.artifactService.publishArtifact(artifact.id);
      } catch (error) {
        deps.logger?.warn(
          { err: error, artifactId: artifact.id },
          "artifact delivery publish failed",
        );
        return { ...base, displayUrl: null, downloadUrl: null };
      }

      return {
        ...base,
        mimeType: published.mimeType,
        sizeBytes: published.sizeBytes,
        displayUrl: options.displayEnabled ? sign(artifact.id, "display", options) : null,
        downloadUrl: options.downloadEnabled ? sign(artifact.id, "download", options) : null,
      };
    },
  };
}
