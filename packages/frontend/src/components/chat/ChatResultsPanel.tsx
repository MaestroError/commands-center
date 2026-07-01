import { ExternalLink, FileText, Link2 } from "lucide-react";

import type { Artifact } from "@cc/shared/schemas";

import { ArtifactShareControls } from "@/components/tasks/ArtifactShareControls";
import { buildArtifactHref } from "@/components/tasks/task-format";
import { useConversationArtifactsQuery } from "@/hooks/use-tasks-query";

type ChatResultsPanelProps = {
  conversationId: string;
};

// Compact "Results" strip pinned to the bottom of the chat context pane. Shows
// the artifacts (files, documents, links) the specialist registered as
// outcomes — newest first, with the latest few visible and the rest reachable
// by scrolling. After "Continue in chat" this also surfaces the originating
// task run's artifacts, since they share the same conversation.
export function ChatResultsPanel(props: ChatResultsPanelProps) {
  const artifactsQuery = useConversationArtifactsQuery(props.conversationId);
  const artifacts = artifactsQuery.data?.artifacts ?? [];

  return (
    <section aria-label="Conversation results" className="flex max-h-56 flex-col">
      <header className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Results
        </span>
        {artifacts.length > 0 ? (
          <span className="text-xs text-text-muted">{artifacts.length}</span>
        ) : null}
      </header>
      {artifacts.length === 0 ? (
        <p className="px-3 pb-3 text-xs text-text-muted">
          {artifactsQuery.isLoading
            ? "Loading results…"
            : "No results yet. Files, documents, and links the specialist produces appear here."}
        </p>
      ) : (
        <ul className="grid gap-1.5 overflow-y-auto px-3 pb-3" aria-label="Results list">
          {artifacts.map((artifact) => (
            <ResultItem key={artifact.id} artifact={artifact} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ResultItem({ artifact }: { artifact: Artifact }) {
  const href = buildArtifactHref(artifact);

  return (
    <li className="rounded-md border border-border bg-surface p-2 text-xs text-text-secondary">
      <div className="flex items-start gap-2">
        <ArtifactIcon type={artifact.type} />
        <span className="min-w-0 flex-1">
          <a
            className="break-words font-medium text-accent underline-offset-4 hover:underline [overflow-wrap:anywhere]"
            href={href}
            rel="noreferrer"
            target={artifact.type === "url" ? "_blank" : undefined}
          >
            {artifact.title}
          </a>
          <span className="block text-[11px] text-text-muted [overflow-wrap:anywhere]">
            {artifact.link}
          </span>
          <ArtifactShareControls artifact={artifact} />
        </span>
      </div>
    </li>
  );
}

function ArtifactIcon({ type }: { type: Artifact["type"] }) {
  const className = "mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted";
  if (type === "url") {
    return <ExternalLink className={className} aria-hidden="true" />;
  }
  if (type === "document") {
    return <FileText className={className} aria-hidden="true" />;
  }
  return <Link2 className={className} aria-hidden="true" />;
}
