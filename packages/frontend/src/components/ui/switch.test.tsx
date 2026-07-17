import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SwitchRoot, SwitchThumb } from "./switch";

describe("Switch", () => {
  it("exposes checked state and forwards changes", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SwitchRoot aria-label="Enabled" checked={false} onCheckedChange={onCheckedChange}>
        <SwitchThumb />
      </SwitchRoot>,
    );

    const control = screen.getByRole("switch", { name: "Enabled" });
    expect(control).not.toBeChecked();
    await user.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("does not activate while disabled", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SwitchRoot disabled aria-label="Enabled" onCheckedChange={onCheckedChange}>
        <SwitchThumb />
      </SwitchRoot>,
    );

    await user.click(screen.getByRole("switch", { name: "Enabled" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
