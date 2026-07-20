import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-[var(--radius-badge)] border px-3 py-1 text-xs uppercase tracking-[0.16em] font-[var(--font-weight-badge)]",
  {
    variants: {
      variant: {
        neutral:
          "border-badge-neutral-border bg-badge-neutral-surface text-badge-neutral-foreground",
        success: "border-success-border bg-success-surface text-success-foreground",
        warning: "border-warning-border bg-warning-surface text-warning-foreground",
        danger: "border-danger-border bg-danger-surface-subtle text-danger-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant, ...props },
  ref,
) {
  return <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />;
});
