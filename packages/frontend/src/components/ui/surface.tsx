import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/cn";

const surfaceVariants = cva("", {
  variants: {
    variant: {
      default: "cc-panel",
      empty: "cc-empty-state",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export type SurfaceProps = React.ComponentProps<"div"> &
  VariantProps<typeof surfaceVariants> & {
    asChild?: boolean;
  };

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { asChild = false, className, variant, ...props },
  ref,
) {
  const Component = asChild ? Slot.Root : "div";
  return <Component ref={ref} className={cn(surfaceVariants({ variant }), className)} {...props} />;
});
