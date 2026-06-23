import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

import type { SystemPromptVariableMeta } from "@cc/shared/schemas";

type SystemPromptVariablePillsProps = {
  variables: SystemPromptVariableMeta[];
};

export function SystemPromptVariablePills({ variables }: SystemPromptVariablePillsProps) {
  if (variables.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {variables.map((variable) => (
        <VariablePill key={variable.id} variable={variable} />
      ))}
    </div>
  );
}

function VariablePill({ variable }: { variable: SystemPromptVariableMeta }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token = `{{ ${variable.id} }}`;

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    void navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, 1500);
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`${variable.description} — click to copy ${token}`}
      className="inline-flex items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-text-secondary transition hover:border-accent/50 hover:text-text-primary"
    >
      {copied ? (
        <>
          <Check aria-hidden="true" className="h-3 w-3 text-success" />
          Copied
        </>
      ) : (
        token
      )}
    </button>
  );
}
