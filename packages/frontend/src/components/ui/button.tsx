import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

/**
 * Typed entry point to CC's existing `cc-button*` visual contract. The
 * compatibility classes in styles/globals.css remain the single source of
 * truth for appearance; this primitive only selects among them and preserves
 * native <button> semantics. Class-only `cc-button` consumers are unaffected.
 */
const buttonVariants = cva("cc-button", {
  variants: {
    variant: {
      primary: "",
      secondary: "cc-button-secondary",
      danger: "cc-button-danger",
    },
    size: {
      default: "",
      icon: "cc-button-icon",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "default",
  },
});

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
