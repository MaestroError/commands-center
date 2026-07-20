import { forwardRef } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

import { cn } from "@/lib/cn";

export const TooltipTrigger = TooltipPrimitive.Trigger;

export function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipPrimitive.Provider disableHoverableContent delayDuration={0} skipDelayDuration={0}>
      <TooltipPrimitive.Root {...props} />
    </TooltipPrimitive.Provider>
  );
}

export const TooltipContent = forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, collisionPadding = 8, sideOffset = 6, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        className={cn(
          "z-50 max-w-64 whitespace-normal break-words rounded-md border border-border bg-surface-elevated px-2.5 py-1.5 text-left text-xs leading-5 text-text-primary shadow-lg",
          className,
        )}
        collisionPadding={collisionPadding}
        sideOffset={sideOffset}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
