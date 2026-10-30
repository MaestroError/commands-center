import type { ReactNode } from "react";
import type { Artifact, Specialist } from "@cc/shared/schemas";
import { Markdown } from "@/components/chat/Markdown";
import { SpecialistAvatar } from "@/components/specialists/specialist-avatar";
import { ArtifactShareControls } from "./ArtifactShareControls";
import { buildArtifactHref } from "./task-format";
export function FeedbackComment(props: {
  author: string;
  agent?: Specialist;
  body: string;
  artifacts?: Artifact[];
  taskId?: string;
  runId?: string;
  meta: ReactNode;
  tone: "operator" | "agent";
  children?: ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-surface-elevated p-3 shadow-sm">
      {props.agent ? (
        <SpecialistAvatar iconPath={props.agent.iconPath} name={props.agent.name} size="sm" />
      ) : (
        <div
          aria-hidden="true"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
            props.tone === "agent"
              ? "bg-accent/15 text-accent"
              : "bg-surface-muted text-text-primary"
          }`}
        >
          {props.author.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span className="font-medium text-text-primary">{props.author}</span>
          {props.meta}
        </div>
        <Markdown
          className="mt-1 text-sm leading-6 text-text-secondary [&_*:first-child]:mt-0 [&_*:last-child]:mb-0 [&_p]:whitespace-pre-wrap [&_p]:text-inherit"
          content={props.body}
        />
        <RunArtifactAttachments
          artifacts={props.artifacts ?? []}
          taskId={props.taskId}
          runId={props.runId}
        />
        {props.children}
      </div>
    </div>
  );
}

function RunArtifactAttachments(props: { artifacts: Artifact[]; taskId?: string; runId?: string }) {
  if (props.artifacts.length === 0) {
    return null;
  }

  return (
    <ul className="mt-3 grid gap-2" aria-label="Run artifacts">
      {props.artifacts.map((artifact) => {
        const href = buildArtifactHref(artifact);
        return (
          <li
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm text-text-secondary"
            key={artifact.id}
          >
            <span className="min-w-0">
              <a
                className="break-words font-medium text-accent underline-offset-4 hover:underline [overflow-wrap:anywhere]"
                href={href}
                rel="noreferrer"
                target={artifact.type === "url" ? "_blank" : undefined}
              >
                {artifact.title}
              </a>
              <span className="block text-xs text-text-muted [overflow-wrap:anywhere]">
                {artifact.link}
              </span>
              <span className="mt-2 block text-xs text-text-secondary">
                {artifact.description ?? artifact.title}
              </span>
              {props.taskId ? (
                <ArtifactShareControls artifact={artifact} taskId={props.taskId} />
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
