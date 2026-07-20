import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";
import { Button } from "./button";

afterEach(async () => {
  cleanup();
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
});

function DestructiveAlert(props: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
}) {
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="secondary">Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="danger" disabled={props.confirmDisabled} onClick={props.onConfirm}>
              Delete
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe("AlertDialog", () => {
  it("uses the alertdialog role with accessible name and description", () => {
    render(<DestructiveAlert open />);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Delete workspace?");
    expect(dialog).toHaveAccessibleDescription("This action cannot be undone.");
  });

  it("composes the CC Button visual contract for its actions", () => {
    render(<DestructiveAlert open />);
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "cc-button",
      "cc-button-danger",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass(
      "cc-button",
      "cc-button-secondary",
    );
  });

  it("runs the destructive action and closes when confirmed", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    function Host() {
      const [open, setOpen] = useState(true);
      return <DestructiveAlert open={open} onOpenChange={setOpen} onConfirm={onConfirm} />;
    }
    render(<Host />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("cancels without running the destructive action", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    function Host() {
      const [open, setOpen] = useState(true);
      return <DestructiveAlert open={open} onOpenChange={setOpen} onConfirm={onConfirm} />;
    }
    render(<Host />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("does not run a disabled destructive action", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DestructiveAlert open confirmDisabled onConfirm={onConfirm} />);

    const action = screen.getByRole("button", { name: "Delete" });
    expect(action).toBeDisabled();
    await user.click(action);
    expect(onConfirm).not.toHaveBeenCalled();
    // The dialog stays open because the disabled action never resolved.
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("opens from an uncontrolled trigger", async () => {
    const user = userEvent.setup();
    render(
      <AlertDialog>
        <AlertDialogTrigger>Remove</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Remove item?</AlertDialogTitle>
          <AlertDialogDescription>You can add it again later.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary">Keep</Button>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName("Remove item?");
  });
});
