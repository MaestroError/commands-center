import { useState } from "react";
import { Copy, Link2, X } from "lucide-react";

import type { Artifact } from "@cc/shared/schemas";

import { useTaskMutations } from "@/hooks/use-tasks-query";

type ArtifactShareControlsProps = {
  artifact: Artifact;
  // Optional owning task, used to refresh the task's runs after a share change.
  taskId?: string;
};

export function ArtifactShareControls(props: ArtifactShareControlsProps) {
  const mutations = useTaskMutations();
  const [createdUrl, setCreatedUrl] = useState<string>();
  const [copied, setCopied] = useState(false);

  // Only file artifacts can be published for download.
  if (props.artifact.type !== "file") {
    return null;
  }

  const busy =
    mutations.createArtifactShareLink.isPending || mutations.revokeArtifactShareLink.isPending;
  const shareLinks = props.artifact.shareLinks.filter((link) => link.revokedAt === null);

  async function createLink() {
    const response = await mutations.createArtifactShareLink.mutateAsync({
      artifactId: props.artifact.id,
      conversationId: props.artifact.conversationId,
      taskId: props.taskId,
    });
    setCreatedUrl(response.url);
    try {
      await copyText(response.url);
      setCopied(Boolean(navigator.clipboard));
    } catch {
      setCopied(false);
    }
  }

  async function revokeLink(shareId: string) {
    await mutations.revokeArtifactShareLink.mutateAsync({
      artifactId: props.artifact.id,
      conversationId: props.artifact.conversationId,
      taskId: props.taskId,
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
              void (async () => {
                try {
                  await copyText(createdUrl);
                  setCopied(Boolean(navigator.clipboard));
                } catch {
                  setCopied(false);
                }
              })();
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

async function copyText(value: string): Promise<void> {
  await navigator.clipboard?.writeText(value);
}
