import { useState } from "react";

type CopyIdButtonProps = {
  value: string;
  label: string;
  className?: string;
};

export function CopyIdButton({ value, label, className }: CopyIdButtonProps) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      aria-label={`Copy ${label}`}
      className={
        className ??
        `rounded-sm p-1 transition-colors ${
          copied
            ? "bg-emerald-500/15 text-emerald-600"
            : "text-text-secondary hover:text-text-primary"
        }`
      }
      onClick={() => void handleCopy()}
      title={copied ? "Copied" : `Copy ${label}`}
      type="button"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );

  async function handleCopy() {
    await navigator.clipboard.writeText(value).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
      <path
        d="M9 9.75A2.25 2.25 0 0 1 11.25 7.5h7.5A2.25 2.25 0 0 1 21 9.75v7.5a2.25 2.25 0 0 1-2.25 2.25h-7.5A2.25 2.25 0 0 1 9 17.25v-7.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M15 7.5v-.75A2.25 2.25 0 0 0 12.75 4.5h-7.5A2.25 2.25 0 0 0 3 6.75v7.5a2.25 2.25 0 0 0 2.25 2.25H6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
      <path
        d="M4.5 12.75L10.5 18L19.5 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
