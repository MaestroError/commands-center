import { forwardRef } from "react";

import { cn } from "@/lib/cn";

export type TextareaProps = React.ComponentProps<"textarea">;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn("cc-input", className)} {...props} />;
});
