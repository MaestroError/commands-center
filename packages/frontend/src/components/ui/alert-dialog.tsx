import { AlertDialog as AlertDialogPrimitive } from "radix-ui";

import { cn } from "@/lib/cn";

/**
 * Interruptive / destructive confirmation dialog. Radix AlertDialog owns modal
 * semantics, focus containment/return, and the safe-by-default behavior the
 * DS-0201 destructive contract requires: outside interaction does not dismiss,
 * Escape routes to cancel, and the Cancel control receives initial focus so the
 * destructive action is never the default. CC owns the exported API and the
 * semantic-token appearance. Actions compose the CC Button via `asChild` rather
 * than restyling; this primitive owns no labels, callbacks, or copy.
 */
export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;
export const AlertDialogAction = AlertDialogPrimitive.Action;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;

export function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      className={cn("fixed inset-0 z-50 bg-app-bg/75", className)}
      {...props}
    />
  );
}

export function AlertDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        className={cn(
          "cc-panel fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col p-6",
          "max-h-[calc(100dvh-2rem)] overflow-y-auto break-words",
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  );
}

export function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("mt-6 flex flex-wrap justify-end gap-2", className)} {...props} />
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn("text-xl font-semibold text-text-primary", className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={cn("mt-1 text-sm leading-6 text-text-secondary", className)}
      {...props}
    />
  );
}
