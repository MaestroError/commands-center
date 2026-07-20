import { useRef, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function ConfirmDialog(props: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  confirmDisabled?: boolean;
}) {
  const actionCloseRef = useRef(false);
  // Consumers render ConfirmDialog conditionally and unmount it on confirm or
  // cancel, so the AlertDialog never transitions open -> closed while mounted
  // and Radix's onCloseAutoFocus never runs. Capture the invoking control at
  // mount (before Radix moves focus inward) and restore it ourselves so focus
  // returns to the trigger. Do not remove this in favor of Radix's built-in
  // focus return unless ConfirmDialog is changed to own its open state.
  const restoreFocusRef = useRef(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  const restoreFocus = () => {
    requestAnimationFrame(() => restoreFocusRef.current?.focus());
  };

  const runAction = (action: () => void) => {
    actionCloseRef.current = true;
    action();
    restoreFocus();
  };

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (open) return;
        if (actionCloseRef.current) {
          actionCloseRef.current = false;
          return;
        }
        props.onCancel();
        restoreFocus();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="mt-3 text-sm leading-6 text-text-secondary">{props.description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="justify-start">
          <AlertDialogAction asChild>
            <Button
              disabled={props.confirmDisabled}
              onClick={() => runAction(props.onConfirm)}
              variant={props.confirmVariant === "danger" ? "danger" : "primary"}
            >
              {props.confirmLabel}
            </Button>
          </AlertDialogAction>
          {props.secondaryLabel && props.onSecondary ? (
            <AlertDialogAction asChild>
              <Button variant="secondary" onClick={() => runAction(props.onSecondary!)}>
                {props.secondaryLabel}
              </Button>
            </AlertDialogAction>
          ) : null}
          <AlertDialogCancel asChild>
            <Button variant="secondary">Cancel</Button>
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
