import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@/lib/cn";

/**
 * Ordinary modal dialog. Radix owns portal, focus containment/return, Escape,
 * and outside-interaction behavior (backdrop click and Escape both close, per
 * the DS-0201 ordinary-dialog contract). CC owns the exported API and the
 * semantic-token appearance, reusing the existing `.cc-panel` surface contract.
 * Consumers compose actions with the CC Button; this primitive owns no labels,
 * callbacks, or form state.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

type DialogContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & {
  overlayClassName?: string;
};

export function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn("fixed inset-0 z-50 bg-app-bg/75", className)}
      data-slot="dialog-overlay"
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  overlayClassName,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        className={cn(
          "cc-panel fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col p-6",
          "max-h-[calc(100dvh-2rem)] overflow-y-auto break-words",
          className,
        )}
        data-slot="dialog-content"
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("mt-6 flex flex-wrap justify-end gap-2", className)} {...props} />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-xl font-semibold text-text-primary", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("mt-1 text-sm leading-6 text-text-secondary", className)}
      {...props}
    />
  );
}
