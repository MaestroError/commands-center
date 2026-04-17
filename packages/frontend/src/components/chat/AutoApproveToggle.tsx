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
          ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
          : "bg-[--bg-secondary] text-[--text-secondary] hover:bg-[--bg-tertiary] hover:text-[--text-primary]"
      }`}
      title={enabled ? "Auto-approve enabled" : "Auto-approve disabled"}
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <span className="hidden sm:inline">Auto</span>
    </button>
  );
}
