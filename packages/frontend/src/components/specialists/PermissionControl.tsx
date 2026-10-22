export function PermissionControl<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string; selectedClassName: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-border bg-surface p-1">
      {props.options.map((option) => (
        <button
          aria-label={`${props.label} ${option.label}`}
          aria-pressed={props.value === option.value}
          className={
            props.value === option.value
              ? `rounded-lg border px-3 py-1.5 text-xs font-medium transition ${option.selectedClassName}`
              : "rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
          }
          key={option.value}
          onClick={() => props.onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
