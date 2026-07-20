import { forwardRef } from "react";
import { Slot } from "radix-ui";

import { cn } from "@/lib/cn";

export type AlertProps = React.ComponentProps<"div"> & {
  asChild?: boolean;
};

export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { asChild = false, className, ...props },
  ref,
) {
  const Component = asChild ? Slot.Root : "div";
  return <Component ref={ref} className={cn("cc-alert", className)} {...props} />;
});
