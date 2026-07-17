import { useState } from "react";
import { Check, Copy } from "lucide-react";

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
            ? "bg-success-surface text-success-foreground"
            : "text-text-secondary hover:text-text-primary"
        }`
      }
      onClick={() => void handleCopy()}
      title={copied ? "Copied" : `Copy ${label}`}
      type="button"
    >
      {copied ? (
        <Check aria-hidden="true" className="h-3.5 w-3.5" />
      ) : (
        <Copy aria-hidden="true" className="h-3.5 w-3.5" />
      )}
    </button>
  );

  async function handleCopy() {
    await navigator.clipboard.writeText(value).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
}
