import { useState } from "react";
import { Copy, Link2, X } from "lucide-react";

import type { Artifact, CreateArtifactShareLinkResponse } from "@cc/shared/schemas";

import { useTaskMutations } from "@/hooks/use-tasks-query";

type ArtifactShareControlsProps = {
  artifact: Artifact;
  // Optional owning task, used to refresh the task's runs after a share change.
  taskId?: string;
};

export function ArtifactShareControls(props: ArtifactShareControlsProps) {
  const mutations = useTaskMutations();
  const [createdLinks, setCreatedLinks] = useState<CreateArtifactShareLinkResponse>();
  const [copiedLink, setCopiedLink] = useState<"display" | "download" | undefined>();
  const [errorMessage, setErrorMessage] = useState<string>();

  // URL artifacts already point at their public destination.
  if (props.artifact.type === "url") {
    return null;
  }

  const busy =
    mutations.createArtifactShareLink.isPending || mutations.revokeArtifactShareLink.isPending;
  const shareLinks = props.artifact.shareLinks.filter((link) => link.revokedAt === null);

  async function createLink() {
    setErrorMessage(undefined);
    try {
      const response = await mutations.createArtifactShareLink.mutateAsync({
        artifactId: props.artifact.id,
        conversationId: props.artifact.conversationId,
        taskId: props.taskId,
      });
      setCreatedLinks(response);
      await copyLink("display", response.displayUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create signed links.");
    }
  }

  async function revokeLink(shareId: string) {
    setErrorMessage(undefined);
    try {
      await mutations.revokeArtifactShareLink.mutateAsync({
        artifactId: props.artifact.id,
        conversationId: props.artifact.conversationId,
        taskId: props.taskId,
        shareId,
      });
      setCreatedLinks(undefined);
      setCopiedLink(undefined);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to revoke signed link.");
    }
  }

  async function copyLink(kind: "display" | "download", url: string) {
    try {
      await copyText(url);
      setCopiedLink(navigator.clipboard ? kind : undefined);
    } catch {
      setCopiedLink(undefined);
    }
  }

  return (
    <div className="mt-3 grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="cc-button cc-button-secondary inline-flex items-center gap-2 px-3 py-1.5 text-xs"
          disabled={busy}
          onClick={() => void createLink()}
          type="button"
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          {createdLinks ? "Refresh signed links" : "Create signed link"}
        </button>
      </div>
      {createdLinks ? (
        <div
          className="grid gap-2 rounded-md border border-border bg-app-bg px-3 py-2 text-xs"
          aria-label="Generated artifact links"
        >
          <GeneratedLinkRow
            copied={copiedLink === "display"}
            label="Render URL"
            onCopy={() => void copyLink("display", createdLinks.displayUrl)}
            url={createdLinks.displayUrl}
          />
          <GeneratedLinkRow
            copied={copiedLink === "download"}
            label="Download URL"
            onCopy={() => void copyLink("download", createdLinks.downloadUrl)}
            url={createdLinks.downloadUrl}
          />
        </div>
      ) : null}
      {errorMessage ? <p className="text-xs text-danger">{errorMessage}</p> : null}
      {shareLinks.length > 0 ? (
        <ul className="grid gap-1" aria-label="Active artifact share links">
          {shareLinks.map((link) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-app-bg px-3 py-2 text-xs text-text-secondary"
              key={link.id}
            >
              <span>
                {link.expiresAt
                  ? `Link expires ${new Date(link.expiresAt).toLocaleString()}`
                  : "Link does not expire"}{" "}
                · {link.downloadCount} download{link.downloadCount === 1 ? "" : "s"}
              </span>
              <button
                className="cc-button cc-button-secondary inline-flex items-center gap-1 px-2 py-1 text-xs"
                disabled={busy}
                onClick={() => void revokeLink(link.id)}
                type="button"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function GeneratedLinkRow(props: {
  copied: boolean;
  label: string;
  onCopy: () => void;
  url: string;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-center">
      <span className="font-medium text-text-secondary">{props.label}</span>
      <span className="break-all text-text-muted [overflow-wrap:anywhere]">{props.url}</span>
      <button
        className="cc-button cc-button-secondary inline-flex w-fit items-center gap-1 px-2 py-1 text-xs"
        onClick={props.onCopy}
        type="button"
      >
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        {props.copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard?.writeText(value);
}
