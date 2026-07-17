import { SwitchRoot, SwitchThumb } from "@/components/ui/switch";

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

export function Switch(props: SwitchProps) {
  return (
    <SwitchRoot
      aria-label={props["aria-label"] ?? props.label}
      checked={props.checked}
      disabled={props.disabled}
      onCheckedChange={props.onChange}
    >
      <SwitchThumb />
    </SwitchRoot>
  );
}
