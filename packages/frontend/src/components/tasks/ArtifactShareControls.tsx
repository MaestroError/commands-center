import { useState } from "react";
import { Copy, Link2, X } from "lucide-react";

import type { TaskRunArtifact } from "@cc/shared/schemas";

import { useTaskMutations, useTaskRunArtifactsQuery } from "@/hooks/use-tasks-query";

type ArtifactShareControlsProps = {
  taskId: string;
  runId: string;
  artifact: TaskRunArtifact;
};

export function ArtifactShareControls(props: ArtifactShareControlsProps) {
  const artifactsQuery = useTaskRunArtifactsQuery(props.taskId, props.runId);
  const mutations = useTaskMutations();
  const [createdUrl, setCreatedUrl] = useState<string>();
  const [copied, setCopied] = useState(false);

  if (!props.artifact.path) {
    return null;
  }

  const candidate = artifactsQuery.data?.artifacts.find(
    (artifact) =>
      artifact.title === props.artifact.title &&
      artifact.originalFilename === basename(props.artifact.path),
  );
  const busy =
    mutations.createArtifactShareLink.isPending || mutations.revokeArtifactShareLink.isPending;

  if (artifactsQuery.isLoading) {
    return <span className="text-xs text-text-muted">Loading share state...</span>;
  }

  if (!candidate) {
    return <span className="text-xs text-text-muted">Source file unavailable for sharing.</span>;
  }

  async function createLink() {
    if (!candidate) return;
    const response = await mutations.createArtifactShareLink.mutateAsync({
      taskId: props.taskId,
      runId: props.runId,
      artifactId: candidate.id,
    });
    setCreatedUrl(response.url);
    await copyText(response.url);
    setCopied(true);
  }

  async function revokeLink(shareId: string) {
    if (!candidate) return;
    await mutations.revokeArtifactShareLink.mutateAsync({
      taskId: props.taskId,
      runId: props.runId,
      artifactId: candidate.id,
      shareId,
    });
    setCreatedUrl(undefined);
    setCopied(false);
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
          Create signed link
        </button>
        {createdUrl ? (
          <button
            className="cc-button cc-button-secondary inline-flex items-center gap-2 px-3 py-1.5 text-xs"
            onClick={() => {
              void copyText(createdUrl);
              setCopied(true);
            }}
            type="button"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            {copied ? "Copied" : "Copy link"}
          </button>
        ) : null}
      </div>
      {createdUrl ? (
        <p className="break-all text-xs text-text-muted [overflow-wrap:anywhere]">{createdUrl}</p>
      ) : null}
      {candidate.shareLinks.length > 0 ? (
        <ul className="grid gap-1" aria-label="Active artifact share links">
          {candidate.shareLinks.map((link) => (
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

async function copyText(value: string): Promise<void> {
  await navigator.clipboard?.writeText(value);
}

function basename(path: string | undefined): string {
  const segments = path?.split("/").filter(Boolean) ?? [];
  return segments[segments.length - 1] ?? "";
}
