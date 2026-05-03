type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  "aria-label"?: string;
};

export function Switch(props: SwitchProps) {
  return (
    <button
      aria-checked={props.checked}
      aria-label={props["aria-label"] ?? props.label}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        props.checked ? "bg-emerald-500" : "bg-muted",
      ].join(" ")}
      onClick={() => props.onChange(!props.checked)}
      role="switch"
      type="button"
    >
      <span
        className={[
          "pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200",
          props.checked ? "translate-x-4" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}
