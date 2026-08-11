// Shared between IntegrationsPage sections (issue #99 split).

import { useState } from "react";

import { copyText, toMcpServerName } from "./integration-helpers";
import { CheckIcon, ChevronIcon, CopyIcon } from "./integration-icons";

export function DerivedNameNote(props: { label: string }) {
  const name = toMcpServerName(props.label);

  if (!name || name === props.label.trim()) {
    return null;
  }

  return (
    <p className="mt-2 text-xs text-text-secondary">
      Saved as <code>{name}</code>
    </p>
  );
}

export function SectionToggleButton(props: {
  expanded: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-expanded={props.expanded}
      aria-label={`${props.expanded ? "Collapse" : "Expand"} ${props.label}`}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:border-accent hover:text-text-primary"
      onClick={props.onClick}
      type="button"
    >
      {props.expanded ? "Collapse" : "Expand"}
      <ChevronIcon expanded={props.expanded} />
    </button>
  );
}

export function SecretKeyPill(props: { secret: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-warning-border bg-warning-surface px-2 py-1 font-mono text-[11px]">
      <button
        className="transition hover:text-warning"
        onClick={() => void handleCopy()}
        title={`Copy ${props.secret}`}
        type="button"
      >
        {props.secret}
      </button>
      <button
        aria-label={`Copy ${props.secret}`}
        className="rounded-sm p-0.5 transition hover:bg-warning/10 hover:text-warning"
        onClick={() => void handleCopy()}
        type="button"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );

  async function handleCopy() {
    await copyText(props.secret);
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
    }, 1200);
  }
}
