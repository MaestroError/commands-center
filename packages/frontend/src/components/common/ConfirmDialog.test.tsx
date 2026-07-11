import { render, screen } from "@testing-library/react";
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
});
