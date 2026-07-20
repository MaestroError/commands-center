import { forwardRef } from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/cn";

export const SwitchRoot = forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function SwitchRoot({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border bg-surface-elevated transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        "disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    />
  );
});

export const SwitchThumb = forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Thumb>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Thumb>
>(function SwitchThumb({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Thumb
      ref={ref}
      className={cn(
        "pointer-events-none block size-4 translate-x-0 rounded-full bg-text-secondary shadow-sm transition-transform",
        "data-[state=checked]:translate-x-4 data-[state=checked]:bg-on-accent",
        className,
      )}
      {...props}
    />
  );
});
