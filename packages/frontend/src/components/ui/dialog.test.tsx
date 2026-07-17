import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

function ControlledDialog(props: { open: boolean; onOpenChange?: (open: boolean) => void }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename document</DialogTitle>
          <DialogDescription>Choose a new name for this document.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("associates the title and description as accessible name/description", () => {
    render(<ControlledDialog open />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Rename document");
    expect(dialog).toHaveAccessibleDescription("Choose a new name for this document.");
  });

  it("is not rendered when closed", () => {
    render(<ControlledDialog open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens from an uncontrolled trigger", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Uncontrolled</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Uncontrolled");
  });

  it("requests close through onOpenChange when the close control is activated", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ControlledDialog open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("supports the full uncontrolled open/close lifecycle", async () => {
    const user = userEvent.setup();
    function Uncontrolled() {
      const [open, setOpen] = useState(false);
      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent>
            <DialogTitle>Lifecycle</DialogTitle>
            <DialogFooter>
              <DialogClose asChild>
                <Button>Done</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
    render(<Uncontrolled />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
