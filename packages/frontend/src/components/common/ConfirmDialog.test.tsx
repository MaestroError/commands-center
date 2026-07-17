import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders outside a clipped ancestor", () => {
    render(
      <div data-testid="clipped-ancestor" className="overflow-hidden">
        <ConfirmDialog
          confirmLabel="Confirm"
          description="Confirm this action."
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          title="Are you sure?"
        />
      </div>,
    );

    expect(screen.getByTestId("clipped-ancestor")).not.toContainElement(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog").parentElement?.parentElement).toBe(document.body);
  });

  // Pre-migration contract (DS-0201): lock the public behavior Phase 3 must
  // preserve when ConfirmDialog is migrated onto the AlertDialog primitive.
  // Overlay/Escape dismissal is intentionally not asserted here because the
  // approved contract changes it for destructive dialogs in Phase 3.

  it("exposes the title as the dialog's accessible name", () => {
    render(
      <ConfirmDialog
        confirmLabel="Confirm"
        description="Confirm this action."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete workspace?"
      />,
    );

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Delete workspace?");
  });

  it("invokes onConfirm when the confirm action is activated", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        confirmLabel="Delete"
        description="This cannot be undone."
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        title="Delete?"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("invokes onCancel when the Cancel action is activated", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        confirmLabel="Confirm"
        description="Confirm this action."
        onCancel={onCancel}
        onConfirm={vi.fn()}
        title="Are you sure?"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders the danger visual contract for a destructive confirm action", () => {
    render(
      <ConfirmDialog
        confirmLabel="Delete"
        confirmVariant="danger"
        description="This cannot be undone."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete?"
      />,
    );

    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("cc-button-danger");
  });

  it("blocks activation when the confirm action is disabled", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        confirmDisabled
        confirmLabel="Confirm"
        description="Confirm this action."
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        title="Are you sure?"
      />,
    );

    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("renders an optional secondary action and wires its callback", async () => {
    const onSecondary = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        confirmLabel="Save"
        description="Keep your changes?"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onSecondary={onSecondary}
        secondaryLabel="Discard"
        title="Unsaved changes"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it("omits the secondary action when only a label is provided", () => {
    render(
      <ConfirmDialog
        confirmLabel="Save"
        description="Keep your changes?"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        secondaryLabel="Discard"
        title="Unsaved changes"
      />,
    );

    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
  });
});
