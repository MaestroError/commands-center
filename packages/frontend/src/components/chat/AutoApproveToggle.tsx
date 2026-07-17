interface AutoApproveToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function AutoApproveToggle({ enabled, onChange }: AutoApproveToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`flex h-8 items-center gap-1.5 rounded-md px-2 text-sm transition-colors ${
        enabled
          ? "bg-warning-surface text-warning-foreground hover:bg-warning/20"
          : "bg-[--bg-secondary] text-[--text-secondary] hover:bg-[--bg-tertiary] hover:text-[--text-primary]"
      }`}
      title={enabled ? "Auto-approve enabled" : "Auto-approve disabled"}
    >
      <Zap aria-hidden="true" className="h-4 w-4" />
      <span className="hidden sm:inline">Auto</span>
    </button>
  );
}
import { Zap } from "lucide-react";
