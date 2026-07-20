import { forwardRef } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { cn } from "@/lib/cn";

export const Popover = PopoverPrimitive.Root;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export const PopoverContent = forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent({ align = "start", className, sideOffset = 4, ...props }, ref) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        className={cn(
          "z-50 max-h-[var(--radix-popover-content-available-height)] overflow-hidden rounded-md border border-border bg-surface text-text-primary shadow-lg",
          className,
        )}
        collisionPadding={8}
        sideOffset={sideOffset}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
