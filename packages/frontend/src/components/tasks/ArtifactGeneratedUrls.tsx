import { useEffect, useState } from "react";
import { Copy } from "lucide-react";

import type { Artifact } from "@cc/shared/schemas";

import { useArtifactDeliveryUrlsQuery } from "@/hooks/use-tasks-query";

type ArtifactGeneratedUrlsProps = {
  artifact: Artifact;
  compact?: boolean;
};

const COPIED_FEEDBACK_DURATION_MS = 2_500;

// Read-only view of the template-driven ("MCP") delivery URLs for an artifact.
// These are deterministic, signed URLs the source template already exposes —
// distinct from the manual, revocable share links in ArtifactShareControls.
// Renders nothing unless the template enables at least one URL.
export function ArtifactGeneratedUrls(props: ArtifactGeneratedUrlsProps) {
  const isPublishable = props.artifact.type === "file" || props.artifact.type === "document";
  const query = useArtifactDeliveryUrlsQuery(props.artifact.id, isPublishable);
  const [copied, setCopied] = useState<"display" | "download">();

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timeout = window.setTimeout(() => setCopied(undefined), COPIED_FEEDBACK_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const urls = query.data;
  const displayUrl = urls?.displayUrl ?? null;
  const downloadUrl = urls?.downloadUrl ?? null;

  if (!isPublishable || (!displayUrl && !downloadUrl)) {
    return null;
  }

  async function copyUrl(kind: "display" | "download", url: string) {
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(navigator.clipboard ? kind : undefined);
    } catch {
      setCopied(undefined);
    }
  }

  const expiryLabel = urls?.expiresAt
    ? `Expires ${new Date(urls.expiresAt).toLocaleString()}`
    : "Does not expire";

  return (
    <div
      className="mt-3 grid gap-2 rounded-md border border-border bg-app-bg px-3 py-2 text-xs"
      aria-label="Template artifact URLs"
    >
      <p className="font-medium text-text-secondary">Generated URLs</p>
      {displayUrl ? (
        <UrlRow
          copied={copied === "display"}
          label="Render URL"
          onCopy={() => void copyUrl("display", displayUrl)}
          showUrl={!props.compact}
          url={displayUrl}
        />
      ) : null}
      {downloadUrl ? (
        <UrlRow
          copied={copied === "download"}
          label="Download URL"
          onCopy={() => void copyUrl("download", downloadUrl)}
          showUrl={!props.compact}
          url={downloadUrl}
        />
      ) : null}
      <p className="text-text-muted">{expiryLabel}</p>
    </div>
  );
}

function UrlRow(props: {
  copied: boolean;
  label: string;
  onCopy: () => void;
  showUrl: boolean;
  url: string;
}) {
  return (
    <div
      className={`grid items-center gap-1 ${props.showUrl ? "sm:grid-cols-[5.5rem_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}
    >
      <span className="font-medium text-text-secondary">{props.label}</span>
      {props.showUrl ? (
        <span className="break-all text-text-muted [overflow-wrap:anywhere]">{props.url}</span>
      ) : null}
      <button
        aria-label={props.copied ? `${props.label} copied` : `Copy ${props.label}`}
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
