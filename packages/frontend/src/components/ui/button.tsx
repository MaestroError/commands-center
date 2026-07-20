import { forwardRef } from "react";
import type { VariantProps } from "class-variance-authority";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/cn";

/**
 * Typed entry point to CC's existing `cc-button*` visual contract. The
 * compatibility classes in styles/globals.css remain the single source of
 * truth for appearance; this primitive selects among them and preserves native
 * <button> semantics. Link-like consumers use the adjacent buttonVariants API.
 */
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, size, variant, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // Default to type="button" so a Button inside a form does not submit it
      // unless the consumer explicitly opts in.
      type={type ?? "button"}
      className={cn(buttonVariants({ size, variant }), className)}
      {...props}
    />
  );
});
